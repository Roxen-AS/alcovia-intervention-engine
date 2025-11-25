const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const axios = require("axios");
const http = require("http");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});
app.use(cors());
app.use(express.json());
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "";
io.on("connection", socket => {
  socket.on("join", studentId => {
    socket.join("student-" + studentId);
  });
});
async function getStudent(client, studentId) {
  const res = await client.query("select id, status, current_intervention from students where id = $1",[studentId]);
  return res.rows[0];
}
function emitStatus(studentId, status, task) {
  io.to("student-" + studentId).emit("status_update", { status, task });
}
app.get("/", (req, res) => { res.send("Intervention server running"); });
app.get("/student-state/:id", async (req, res) => {
  const studentId = req.params.id;
  const client = await pool.connect();
  try {
    const student = await getStudent(client, studentId);
    if (!student) return res.status(404).json({ error: "Student not found" });
    let task = student.current_intervention || null;
    res.json({ status: student.status, task });
  } catch (e) { res.status(500).json({ error: "Server error" }); } finally { client.release(); }
});
app.post("/daily-checkin", async (req, res) => {
  const { student_id, quiz_score, focus_minutes } = req.body;
  if (!student_id) return res.status(400).json({ error: "student_id required" });
  const client = await pool.connect();
  try {
    const success = Number(quiz_score) > 7 && Number(focus_minutes) > 60;
    let status;
    if (success) {
      status = "On Track";
      await client.query("update students set status = $1, current_intervention = null where id = $2",[status, student_id]);
      await client.query("insert into daily_logs (student_id, quiz_score, focus_minutes, status) values ($1,$2,$3,$4)",[student_id, quiz_score, focus_minutes, status]);
      emitStatus(student_id, status, null);
      return res.json({ status: "On Track" });
    } else {
      status = "Needs Intervention";
      await client.query("update students set status = $1 where id = $2",[status, student_id]);
      await client.query("insert into daily_logs (student_id, quiz_score, focus_minutes, status) values ($1,$2,$3,$4)",[student_id, quiz_score, focus_minutes, status]);
      const interventionRes = await client.query("insert into interventions (student_id, status) values ($1,$2) returning id",[student_id, "Pending Mentor"]);
      const interventionId = interventionRes.rows[0].id;
      if (N8N_WEBHOOK_URL) {
        try { await axios.post(N8N_WEBHOOK_URL, { student_id, quiz_score, focus_minutes, intervention_id: interventionId }); } catch (e) {}
      }
      emitStatus(student_id, "Locked", null);
      return res.json({ status: "Pending Mentor Review" });
    }
  } catch (e) { res.status(500).json({ error: "Server error" }); } finally { client.release(); }
});
app.post("/assign-intervention", async (req, res) => {
  const { student_id, intervention_id, task } = req.body;
  if (!student_id || !task) return res.status(400).json({ error: "student_id and task required" });
  const client = await pool.connect();
  try {
    await client.query("update students set status = $1, current_intervention = $2 where id = $3",["Intervention Assigned", task, student_id]);
    if (intervention_id) {
      await client.query("update interventions set description = $1, status = $2 where id = $3",[task, "Assigned", intervention_id]);
    } else {
      await client.query("insert into interventions (student_id, description, status) values ($1,$2,$3)",[student_id, task, "Assigned"]);
    }
    emitStatus(student_id, "Intervention Assigned", task);
    res.json({ status: "Intervention Assigned" });
  } catch (e) { res.status(500).json({ error: "Server error" }); } finally { client.release(); }
});
app.post("/complete-intervention", async (req, res) => {
  const { student_id } = req.body;
  if (!student_id) return res.status(400).json({ error: "student_id required" });
  const client = await pool.connect();
  try {
    await client.query("update students set status = $1, current_intervention = null where id = $2",["On Track", student_id]);
    await client.query("update interventions set status = $1, completed_at = now() where student_id = $2 and status = $3",["Completed", student_id, "Assigned"]);
    emitStatus(student_id, "On Track", null);
    res.json({ status: "On Track" });
  } catch (e) { res.status(500).json({ error: "Server error" }); } finally { client.release(); }
});
const port = process.env.PORT || 3000;
server.listen(port, () => { console.log("Server running on port " + port); });
