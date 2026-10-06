from flask import request
from flask_socketio import join_room, leave_room, disconnect, emit
from flask_jwt_extended import decode_token
from app.extensions import socketio
from app.models import User, CaregiverPatient

def register_socket_events(socketio_instance):
    """Register all Socket.IO event handlers with JWT auth and patient room scoping."""

    @socketio_instance.on('connect')
    def handle_connect(auth=None):
        """Authenticate WebSocket connection using JWT token."""
        token = None
        if auth and isinstance(auth, dict):
            token = auth.get('token')
        if not token:
            token = request.args.get('token')

        if not token:
            print(f"[WS] Rejected connection: no token from {request.sid}")
            disconnect()
            return False

        try:
            decoded = decode_token(token)
            user_id = decoded.get('sub')
            user = User.query.get(user_id)
            if not user or not user.is_active:
                print(f"[WS] Rejected connection: inactive user {user_id}")
                disconnect()
                return False

            # Store user info on the socket session
            request.environ['user_id'] = str(user.id)
            request.environ['user_role'] = user.role
            print(f"[WS] Client connected: {request.sid} (user={user.name}, role={user.role})")

            # Auto-join authorized patient rooms
            if user.role == 'CAREGIVER' and user.caregiver_profile:
                assignments = CaregiverPatient.query.filter_by(
                    caregiver_id=user.caregiver_profile.id
                ).all()
                for a in assignments:
                    room = f"patient_{a.patient_id}"
                    join_room(room)
                    print(f"[WS] Auto-joined assigned room: {room} for caregiver {user.name}")
            elif user.role == 'ADMIN':
                join_room('admin')
                from app.models import Patient
                for p in Patient.query.all():
                    join_room(f"patient_{p.id}")

            emit('connection_response', {
                'status': 'connected',
                'sid': request.sid,
                'user': user.to_dict(),
                'message': 'Authenticated to ParaCare WebSocket'
            })
        except Exception as e:
            print(f"[WS] Token validation failed: {str(e)}")
            disconnect()
            return False

    @socketio_instance.on('disconnect')
    def handle_disconnect():
        print(f"[WS] Client disconnected: {request.sid}")

    @socketio_instance.on('join_patient_room')
    def handle_join_patient_room(data):
        """Join a patient room with caregiver authorization check."""
        patient_id = data.get('patient_id')
        if not patient_id:
            emit('error', {'message': 'patient_id is required'})
            return

        user_id = request.environ.get('user_id')
        user_role = request.environ.get('user_role')

        if not user_id:
            emit('error', {'message': 'Not authenticated'})
            return

        # ADMIN can join any room; CAREGIVER must be assigned
        if user_role == 'CAREGIVER':
            user = User.query.get(user_id)
            if user and user.caregiver_profile:
                is_assigned = CaregiverPatient.query.filter_by(
                    caregiver_id=user.caregiver_profile.id,
                    patient_id=patient_id
                ).first()
                if not is_assigned:
                    emit('error', {'message': 'Access denied: patient not assigned to you'})
                    print(f"[WS] Denied room join: user={user_id} patient={patient_id}")
                    return
            else:
                emit('error', {'message': 'Caregiver profile not found'})
                return

        room = f"patient_{patient_id}"
        join_room(room)
        print(f"[WS] {request.sid} joined room: {room}")
        emit('room_joined', {'room': room, 'patient_id': patient_id})

    @socketio_instance.on('leave_patient_room')
    def handle_leave_patient_room(data):
        patient_id = data.get('patient_id')
        if patient_id:
            room = f"patient_{patient_id}"
            leave_room(room)
            print(f"[WS] {request.sid} left room: {room}")
            emit('room_left', {'room': room, 'patient_id': patient_id})

    @socketio_instance.on('ping_server')
    def handle_ping(data):
        emit('pong_client', {'message': 'pong', 'received': data})
