import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { resolveUserFromBearerToken } from './auth.js';
import { db, isStudentEnrolled, UserRole } from './db.js';

interface Participant {
  ws: WebSocket;
  userId: string;
  userName: string;
  role: UserRole;
  joinedAt: string;
  isMuted: boolean;
  isCamOff: boolean;
  hasRaisedHand: boolean;
  isScreenSharing: boolean;
}

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  role: UserRole;
  text: string;
  timestamp: string;
}

interface LiveRoom {
  roomId: string;
  classId: string;
  subjectName: string;
  section: string;
  teacherId: string;
  teacherName: string;
  sessionTitle: string;
  startedAt: string;
  participants: Map<string, Participant>; // userId -> Participant
  chatMessages: ChatMessage[];
}

// Global active rooms store
const activeRooms = new Map<string, LiveRoom>();

export function getActiveRoom(roomId: string): LiveRoom | undefined {
  return activeRooms.get(roomId);
}

export function closeRoomByClassId(classId: string, endedByUserId?: string): boolean {
  for (const [roomId, room] of activeRooms.entries()) {
    if (room.classId === classId) {
      // Notify all participants
      const payload = JSON.stringify({
        type: 'class-ended',
        message: 'The Teacher has ended the live class.',
        roomId,
      });

      for (const p of room.participants.values()) {
        if (p.ws.readyState === WebSocket.OPEN) {
          p.ws.send(payload);
          p.ws.close(1000, 'Class ended');
        }
      }

      activeRooms.delete(roomId);
      return true;
    }
  }
  return false;
}

export function setupLiveSocket(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: '/ws/live' });

  wss.on('connection', (ws: WebSocket) => {
    let currentRoomId: string | null = null;
    let currentUserId: string | null = null;
    let isAlive = true;

    ws.on('pong', () => {
      isAlive = true;
    });

    const sendJson = (data: any) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
      }
    };

    const broadcastToRoom = (roomId: string, data: any, excludeUserId?: string) => {
      const room = activeRooms.get(roomId);
      if (!room) return;

      const payload = JSON.stringify(data);
      for (const [uid, p] of room.participants.entries()) {
        if (excludeUserId && uid === excludeUserId) continue;
        if (p.ws.readyState === WebSocket.OPEN) {
          p.ws.send(payload);
        }
      }
    };

    const getSanitizedParticipants = (room: LiveRoom) => {
      return Array.from(room.participants.values()).map((p) => ({
        userId: p.userId,
        userName: p.userName,
        role: p.role,
        joinedAt: p.joinedAt,
        isMuted: p.isMuted,
        isCamOff: p.isCamOff,
        hasRaisedHand: p.hasRaisedHand,
        isScreenSharing: p.isScreenSharing,
      }));
    };

    ws.on('message', async (rawMessage: string) => {
      try {
        const msg = JSON.parse(rawMessage.toString());

        switch (msg.type) {
          case 'join-room': {
            const { roomId, classId, token } = msg;

            if (!token) {
              sendJson({ type: 'error', message: 'Authentication required to enter classroom.' });
              ws.close(4001, 'Unauthorized');
              return;
            }

            const user = await resolveUserFromBearerToken(token);
            if (!user) {
              sendJson({ type: 'error', message: 'Invalid or expired session. Please sign in again.' });
              ws.close(4001, 'Invalid token');
              return;
            }

            if (user.status === 'disabled') {
              sendJson({ type: 'error', message: 'Your account has been deactivated.' });
              ws.close(4003, 'Account disabled');
              return;
            }

            const subject = db.subjects.find((s) => s.id === classId);
            if (!subject) {
              sendJson({ type: 'error', message: 'Class not found.' });
              ws.close(4004, 'Class not found');
              return;
            }

            // Strict authorization check (Requirement #11, #12)
            if (user.role === 'student') {
              if (!isStudentEnrolled(user.id, classId)) {
                sendJson({
                  type: 'error',
                  message: 'You are not enrolled in this class.',
                });
                ws.close(4003, 'Forbidden: Not enrolled');
                return;
              }

              // Verify session is active
              if (!subject.live_session || !subject.live_session.is_active) {
                sendJson({
                  type: 'error',
                  message: 'No active live class session found for this class.',
                });
                ws.close(4000, 'Session not active');
                return;
              }
            } else if (user.role === 'teacher') {
              // Verify teacher strictly owns this class
              if (!subject.teacher_id || subject.teacher_id !== user.id) {
                sendJson({
                  type: 'error',
                  message: 'Only the designated instructor can host this live class.',
                });
                ws.close(4003, 'Forbidden: Teacher mismatch');
                return;
              }
            }

            // Get or create live room
            let room = activeRooms.get(roomId);
            if (!room) {
              room = {
                roomId,
                classId,
                subjectName: subject.name,
                section: subject.section || 'B21',
                teacherId: subject.teacher_id || user.id,
                teacherName: subject.teacher_name || user.name,
                sessionTitle: subject.live_session?.session_title || `${subject.name} Live Lecture`,
                startedAt: subject.live_session?.started_at || new Date().toISOString(),
                participants: new Map(),
                chatMessages: [],
              };
              activeRooms.set(roomId, room);
            }

            currentRoomId = roomId;
            currentUserId = user.id;

            const newParticipant: Participant = {
              ws,
              userId: user.id,
              userName: user.name,
              role: user.role,
              joinedAt: new Date().toISOString(),
              isMuted: user.role === 'student', // Students start muted by default
              isCamOff: false,
              hasRaisedHand: false,
              isScreenSharing: false,
            };

            room.participants.set(user.id, newParticipant);

            // Send init confirmation to newly joined participant
            sendJson({
              type: 'joined-success',
              roomInfo: {
                roomId: room.roomId,
                classId: room.classId,
                subjectName: room.subjectName,
                section: room.section,
                teacherId: room.teacherId,
                teacherName: room.teacherName,
                sessionTitle: room.sessionTitle,
                startedAt: room.startedAt,
              },
              currentUser: {
                userId: user.id,
                userName: user.name,
                role: user.role,
                isMuted: newParticipant.isMuted,
                isCamOff: newParticipant.isCamOff,
              },
              participants: getSanitizedParticipants(room),
              chatHistory: room.chatMessages,
            });

            // Broadcast user joined and updated participant state to others
            broadcastToRoom(roomId, {
              type: 'user-joined',
              participant: {
                userId: user.id,
                userName: user.name,
                role: user.role,
                joinedAt: newParticipant.joinedAt,
                isMuted: newParticipant.isMuted,
                isCamOff: newParticipant.isCamOff,
                hasRaisedHand: newParticipant.hasRaisedHand,
                isScreenSharing: newParticipant.isScreenSharing,
              },
              participants: getSanitizedParticipants(room),
            }, user.id);

            break;
          }

          case 'chat-message': {
            if (!currentRoomId || !currentUserId) return;
            const room = activeRooms.get(currentRoomId);
            if (!room) return;

            const participant = room.participants.get(currentUserId);
            if (!participant) return;

            const text = (msg.text || '').trim();
            if (!text) return;

            const chatMsg: ChatMessage = {
              id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              userId: participant.userId,
              userName: participant.userName,
              role: participant.role,
              text,
              timestamp: new Date().toISOString(),
            };

            room.chatMessages.push(chatMsg);
            // Cap chat history to last 200 messages
            if (room.chatMessages.length > 200) {
              room.chatMessages.shift();
            }

            broadcastToRoom(currentRoomId, {
              type: 'chat-message',
              message: chatMsg,
            });
            break;
          }

          case 'raise-hand': {
            if (!currentRoomId || !currentUserId) return;
            const room = activeRooms.get(currentRoomId);
            if (!room) return;

            const participant = room.participants.get(currentUserId);
            if (!participant) return;

            participant.hasRaisedHand = !!msg.raised;

            broadcastToRoom(currentRoomId, {
              type: 'hand-raise-update',
              userId: participant.userId,
              userName: participant.userName,
              hasRaisedHand: participant.hasRaisedHand,
              participants: getSanitizedParticipants(room),
            });
            break;
          }

          case 'lower-hand': {
            if (!currentRoomId || !currentUserId) return;
            const room = activeRooms.get(currentRoomId);
            if (!room) return;

            const sender = room.participants.get(currentUserId);
            if (!sender || sender.role !== 'teacher') return; // Only teacher can lower others' hands

            const targetUserId = msg.targetUserId;
            const targetParticipant = room.participants.get(targetUserId);
            if (targetParticipant) {
              targetParticipant.hasRaisedHand = false;
              broadcastToRoom(currentRoomId, {
                type: 'hand-raise-update',
                userId: targetParticipant.userId,
                userName: targetParticipant.userName,
                hasRaisedHand: false,
                participants: getSanitizedParticipants(room),
              });
            }
            break;
          }

          case 'mute-participant': {
            if (!currentRoomId || !currentUserId) return;
            const room = activeRooms.get(currentRoomId);
            if (!room) return;

            const sender = room.participants.get(currentUserId);
            if (!sender || sender.role !== 'teacher') return; // Only teacher can mute participants

            const targetUserId = msg.targetUserId;
            const targetParticipant = room.participants.get(targetUserId);
            if (targetParticipant) {
              targetParticipant.isMuted = true;
              if (targetParticipant.ws.readyState === WebSocket.OPEN) {
                targetParticipant.ws.send(JSON.stringify({
                  type: 'force-mute',
                  by: sender.userName,
                }));
              }

              broadcastToRoom(currentRoomId, {
                type: 'media-state-update',
                userId: targetParticipant.userId,
                isMuted: true,
                isCamOff: targetParticipant.isCamOff,
                isScreenSharing: targetParticipant.isScreenSharing,
                participants: getSanitizedParticipants(room),
              });
            }
            break;
          }

          case 'remove-participant': {
            if (!currentRoomId || !currentUserId) return;
            const room = activeRooms.get(currentRoomId);
            if (!room) return;

            const sender = room.participants.get(currentUserId);
            if (!sender || sender.role !== 'teacher') return; // Only teacher can remove participants

            const targetUserId = msg.targetUserId;
            const targetParticipant = room.participants.get(targetUserId);
            if (targetParticipant) {
              const removedName = targetParticipant.userName;
              if (targetParticipant.ws.readyState === WebSocket.OPEN) {
                targetParticipant.ws.send(JSON.stringify({
                  type: 'removed-from-class',
                  message: 'You have been removed from this live class by the instructor.',
                  by: sender.userName,
                }));
                targetParticipant.ws.close(4005, 'Removed by instructor');
              }
              room.participants.delete(targetUserId);

              broadcastToRoom(currentRoomId, {
                type: 'user-left',
                userId: targetUserId,
                userName: removedName,
                participants: getSanitizedParticipants(room),
              });
            }
            break;
          }

          case 'media-state': {
            if (!currentRoomId || !currentUserId) return;
            const room = activeRooms.get(currentRoomId);
            if (!room) return;

            const participant = room.participants.get(currentUserId);
            if (!participant) return;

            if (typeof msg.isMuted === 'boolean') participant.isMuted = msg.isMuted;
            if (typeof msg.isCamOff === 'boolean') participant.isCamOff = msg.isCamOff;
            if (typeof msg.isScreenSharing === 'boolean') participant.isScreenSharing = msg.isScreenSharing;

            broadcastToRoom(currentRoomId, {
              type: 'media-state-update',
              userId: participant.userId,
              isMuted: participant.isMuted,
              isCamOff: participant.isCamOff,
              isScreenSharing: participant.isScreenSharing,
              participants: getSanitizedParticipants(room),
            }, currentUserId);
            break;
          }

          case 'webrtc-signal': {
            // Forward WebRTC signaling (offer, answer, ice-candidate) to target peer
            if (!currentRoomId || !currentUserId) return;
            const room = activeRooms.get(currentRoomId);
            if (!room) return;

            const toUserId = msg.toUserId;
            if (!toUserId) return;

            const targetParticipant = room.participants.get(toUserId);
            if (targetParticipant && targetParticipant.ws.readyState === WebSocket.OPEN) {
              targetParticipant.ws.send(JSON.stringify({
                type: 'webrtc-signal',
                fromUserId: currentUserId,
                fromUserName: room.participants.get(currentUserId)?.userName || 'Peer',
                fromRole: room.participants.get(currentUserId)?.role,
                signal: msg.signal,
              }));
            }
            break;
          }

          case 'end-class': {
            if (!currentRoomId || !currentUserId) return;
            const room = activeRooms.get(currentRoomId);
            if (!room) return;

            const sender = room.participants.get(currentUserId);
            if (!sender || sender.role !== 'teacher') {
              sendJson({ type: 'error', message: 'Only the instructor can end this live class.' });
              return;
            }

            // Update database state
            const subject = db.subjects.find((s) => s.id === room.classId);
            if (subject && subject.live_session) {
              subject.live_session.is_active = false;
              subject.live_session.status = 'ended';
              subject.live_session.ended_at = new Date().toISOString();
            }

            const liveClassRecord = db.liveClasses.find((lc) => lc.class_id === room.classId && lc.status === 'live_now');
            if (liveClassRecord) {
              liveClassRecord.status = 'ended';
              liveClassRecord.ended_at = new Date().toISOString();
            }

            db.persist();

            // Broadcast class ended to all participants
            broadcastToRoom(currentRoomId, {
              type: 'class-ended',
              message: 'The Teacher has ended the live class.',
              endedAt: new Date().toISOString(),
            });

            // Clean up room
            activeRooms.delete(currentRoomId);
            break;
          }

          case 'leave-room': {
            if (currentRoomId && currentUserId) {
              handleUserLeave(currentRoomId, currentUserId);
              currentRoomId = null;
              currentUserId = null;
            }
            break;
          }
        }
      } catch (err) {
        console.error('Error handling WebSocket message:', err);
      }
    });

    const handleUserLeave = (roomId: string, userId: string) => {
      const room = activeRooms.get(roomId);
      if (!room) return;

      const participant = room.participants.get(userId);
      if (!participant) return;

      room.participants.delete(userId);

      broadcastToRoom(roomId, {
        type: 'user-left',
        userId,
        userName: participant.userName,
        role: participant.role,
        participants: getSanitizedParticipants(room),
      });

      // If room is empty, delete room
      if (room.participants.size === 0) {
        activeRooms.delete(roomId);
      }
    };

    ws.on('close', () => {
      if (currentRoomId && currentUserId) {
        handleUserLeave(currentRoomId, currentUserId);
      }
    });

    ws.on('error', (err) => {
      console.warn('WebSocket client error:', err.message);
      if (currentRoomId && currentUserId) {
        handleUserLeave(currentRoomId, currentUserId);
      }
    });
  });

  // Keep-alive heartbeat interval
  const pingInterval = setInterval(() => {
    wss.clients.forEach((client: any) => {
      if (client.isAlive === false) {
        return client.terminate();
      }
      client.isAlive = false;
      client.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(pingInterval);
  });
}
