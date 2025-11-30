# Alcovia — Intervention Engine (Demo)

Overview
A closed-loop intervention prototype: Student web app → Node.js backend → Supabase (Postgres) → n8n human-in-loop automation. Real-time unlock via WebSockets and cheater detection (tab switch). Clean neon cyberpunk UI (demo).

Live App: https://alcovia-intervention-engine.netlify.app/
Backend: <PUT RENDER URL HERE>
Repo: https://github.com/Roxen-AS/alcovia-intervention-engine

How it works
1. Student submits daily check-in to /daily-checkin.
2. Backend evaluates the Logic Gate:
   - Success: quiz_score > 7 AND focus_minutes > 60 → status On Track.
   - Failure: backend sets status Needs Intervention, creates an intervention, triggers n8n webhook.
3. n8n emails the Mentor with an approve link and waits.
4. Mentor clicks the link → n8n calls /assign-intervention on the backend.
5. Backend updates the DB and emits a WebSocket event → student app unlocks and shows remedial task.
6. Student marks complete → backend sets status On Track.

Demo student
ID: 11111111-1111-1111-1111-111111111111
Email: student@example.com
