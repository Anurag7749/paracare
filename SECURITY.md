# ParaCare Security & Access Control Specifications

## 1. Authentication & Identity Management
- **User Authentication**: Handled via JWT (`Flask-JWT-Extended`). Access tokens expire after 1 hour, refresh tokens after 30 days.
- **Password Hashing**: Passwords stored using PBKDF2 with SHA-256 (`werkzeug.security.generate_password_hash`). Raw passwords never stored or logged.
- **Device Authentication**: ESP32 devices authenticate using registered `device_id`. Unregistered hardware attempts return HTTP 401.

## 2. Authorization & Scoping (RBAC)
- **Roles**:
  - `ADMIN`: Global access across all patients, caregivers, devices, and audit logs.
  - `CAREGIVER`: Scoped access restricted strictly to patients assigned via `caregiver_patients` table.
- **API Scoping**: Endpoints use `check_patient_access` decorator to verify patient assignment for `CAREGIVER` users.
- **WebSocket Scoping**: WebSocket room subscription (`join_patient_room`) enforces JWT token validation and caregiver-patient assignment verification.

## 3. Data Protection & Input Safety
- **SQL Injection Prevention**: All database access goes through SQLAlchemy ORM using parameterized queries. Raw SQL string concatenation is strictly forbidden.
- **XSS Mitigation**: React JSX automatically escapes strings before rendering to DOM.
- **Secret Management**: All secrets (`SECRET_KEY`, `JWT_SECRET_KEY`, `DATABASE_URL`) are loaded from environment variables (`.env`). No production credentials allowed in source code.

## 4. Audit Logging & Compliance
- **Audit Logs**: Critical actions (`LOGIN`, `REGISTER`, `ACKNOWLEDGE_ALERT`, `CREATE_PATIENT`, `ASSIGN_PATIENT`) are recorded in `audit_logs` table with timestamp, user ID, action name, entity, and JSON metadata.
- **Notification Privacy**: No raw patient health credentials exposed in external mock logs.

## 5. Security Checklist
- [x] Passwords hashed with salt
- [x] JWT expiration & signature verification
- [x] RBAC enforcement on patient endpoints
- [x] Device ID verification on telemetry ingest
- [x] WebSocket room access authorization
- [x] Centralized sanitized error responses
- [x] Environment variable isolation
- [x] Audit trail for high-impact actions
