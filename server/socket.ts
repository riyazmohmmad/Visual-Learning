import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'crypto';
import { verifyJwt, UserPayload } from './auth.js';
import { db, LiveClass, LiveParticipant, UserRole } from './db.js';

interface RoomParticipant {
  ws: WebSocket;
  userId: string;
  userName: string;
  role: UserRole;
  isMuted: boolean;
  isCamOff: boolean;
  hasRaisedHand: boolean;
  isScreenSharing: boolean;
  joinedAt: string;
}

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  message: string;
  timestamp: string;
}

// In-memory active live rooms
const activeRooms = new Map<string, Map<string, RoomParticipant>>();
const roomChatHistories = new Map<string, ChatMessage[]>();

// Helper to verify student enrollment in a subject/class
function isStudentEnrolled(studentId: string, subjectId: string): boolean {
  return db.enrollments.some((e) => e.student_id === studentId && e.subject_id === subjectId);
}

export function setupWebSocketServer(server: HttpServer) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket) => {
    let currentLiveClassId: string | null = null;
    let currentUser: UserPayload | null = null;

    ws.on('message', (data: string) => {
      try {
        const msg = JSON.parse(data.toString());

        switch (msg.type) {
          case 'join_room': {
            const { liveClassId, token, isMuted = false, isCamOff = false } = msg;

            if (!liveClassId || !token) {
              ws.send(JSON.stringify({ type: 'error', message: 'Missing liveClassId or token' }));
              return;
            }

            const user = verifyJwt(token);
            if (!user) {
              ws.send(JSON.stringify({ type: 'error', message: 'Authentication required. Invalid or expired token.' }));
              ws.close(4001, 'Unauthorized');
              return;
            }

            const liveClass = db.liveClasses.find((lc) => lc.id === liveClassId);
            if (!liveClass) {
              ws.send(JSON.stringify({ type: 'error', message: 'Live class session not found.' }));
              return;
            }

            // JOIN SECURITY (Requirement #16):
            // Backend verification: Authenticated + Student role + Enrollment
            if (user.role === 'student') {
              if (!isStudentEnrolled(user.id, liveClass.class_id)) {
                ws.send(JSON.stringify({ type: 'error', message: 'You are not enrolled in this class.' }));
                ws.close(4003, 'Forbidden');
                return;
              }
            }

            // TEACHER SECURITY (Requirement #17):
            // Only the owner teacher can host the live class
            if (user.role === 'teacher' && liveClass.teacher_id !== user.id) {
              ws.send(JSON.stringify({ type: 'error', message: 'You are not the designated instructor for this class.' }));
              ws.close(4003, 'Forbidden');
              return;
            }

            currentLiveClassId = liveClassId;
            currentUser = user;

            if (!activeRooms.has(liveClassId)) {
              activeRooms.set(liveClassId, new Map());
            }
            if (!roomChatHistories.has(liveClassId)) {
              roomChatHistories.set(liveClassId, []);
            }

            const room = activeRooms.get(liveClassId)!;

            const participant: RoomParticipant = {
              ws,
              userId: user.id,
              userName: user.name,
              role: user.role,
              isMuted: !!isMuted,
              isCamOff: !!isCamOff,
              hasRaisedHand: false,
              isScreenSharing: false,
              joinedAt: new Date().toISOString(),
            };

            room.set(user.id, participant);

            // Record participant in database
            db.liveParticipants.push({
              id: `part_${crypto.randomUUID().slice(0, 8)}`,
              live_class_id: liveClassId,
              user_id: user.id,
              user_name: user.name,
              role: user.role,
              joined_at: participant.joinedAt,
              isMuted: participant.isMuted,
              isCamOff: participant.isCamOff,
            });
            db.persist();

            // Notify everyone in the room of new participant
            const currentParticipantsList = Array.from(room.values()).map((p) => ({
              userId: p.userId,
              userName: p.userName,
              role: p.role,
              isMuted: p.isMuted,
              isCamOff: p.isCamOff,
              hasRaisedHand: p.hasRaisedHand,
              isScreenSharing: p.isScreenSharing,
              joinedAt: p.joinedAt,
            }));

            // Send room init state to the newly joined participant
            ws.send(
              JSON.stringify({
                type: 'room_state',
                liveClass,
                participants: currentParticipantsList,
                chatHistory: roomChatHistories.get(liveClassId) || [],
                selfUserId: user.id,
              })
            );

            // Broadcast user_joined to other participants
            room.forEach((p) => {
              if (p.userId !== user.id && p.ws.readyState === WebSocket.OPEN) {
                p.ws.send(
                  JSON.stringify({
                    type: 'user_joined',
                    participant: {
                      userId: user.id,
                      userName: user.name,
                      role: user.role,
                      isMuted: participant.isMuted,
                      isCamOff: participant.isCamOff,
                      hasRaisedHand: participant.hasRaisedHand,
                      isScreenSharing: participant.isScreenSharing,
                      joinedAt: participant.joinedAt,
                    },
                  })
                );
              }
            });

            break;
          }

          // WebRTC Signaling: SDP Offer
          case 'signal_offer': {
            if (!currentLiveClassId || !currentUser) return;
            const { targetUserId, sdp } = msg;
            const room = activeRooms.get(currentLiveClassId);
            const target = room?.get(targetUserId);
            if (target && target.ws.readyState === WebSocket.OPEN) {
              target.ws.send(
                JSON.stringify({
                  type: 'signal_offer',
                  senderUserId: currentUser.id,
                  senderUserName: currentUser.name,
                  sdp,
                })
              );
            }
            break;
          }

          // WebRTC Signaling: SDP Answer
          case 'signal_answer': {
            if (!currentLiveClassId || !currentUser) return;
            const { targetUserId, sdp } = msg;
            const room = activeRooms.get(currentLiveClassId);
            const target = room?.get(targetUserId);
            if (target && target.ws.readyState === WebSocket.OPEN) {
              target.ws.send(
                JSON.stringify({
                  type: 'signal_answer',
                  senderUserId: currentUser.id,
                  sdp,
                })
              );
            }
            break;
          }

          // WebRTC Signaling: ICE Candidate
          case 'signal_ice': {
            if (!currentLiveClassId || !currentUser) return;
            const { targetUserId, candidate } = msg;
            const room = activeRooms.get(currentLiveClassId);
            const target = room?.get(targetUserId);
            if (target && target.ws.readyState === WebSocket.OPEN) {
              target.ws.send(
                JSON.stringify({
                  type: 'signal_ice',
                  senderUserId: currentUser.id,
                  candidate,
                })
              );
            }
            break;
          }

          // Media Status Changes (Mute/Unmute, Cam On/Off, Screen Share)
          case 'media_status_change': {
            if (!currentLiveClassId || !currentUser) return;
            const { isMuted, isCamOff, isScreenSharing } = msg;
            const room = activeRooms.get(currentLiveClassId);
            if (room && room.has(currentUser.id)) {
              const p = room.get(currentUser.id)!;
              if (typeof isMuted === 'boolean') p.isMuted = isMuted;
              if (typeof isCamOff === 'boolean') p.isCamOff = isCamOff;
              if (typeof isScreenSharing === 'boolean') p.isScreenSharing = isScreenSharing;

              room.forEach((other) => {
                if (other.ws.readyState === WebSocket.OPEN) {
                  other.ws.send(
                    JSON.stringify({
                      type: 'participant_media_updated',
                      userId: currentUser!.id,
                      isMuted: p.isMuted,
                      isCamOff: p.isCamOff,
                      isScreenSharing: p.isScreenSharing,
                    })
                  );
                }
              });
            }
            break;
          }

          // Class Chat Message
          case 'chat_message': {
            if (!currentLiveClassId || !currentUser) return;
            const { message } = msg;
            if (!message || typeof message !== 'string' || !message.trim()) return;

            const chatMsg: ChatMessage = {
              id: `msg_${Date.now()}_${crypto.randomUUID().slice(0, 4)}`,
              senderId: currentUser.id,
              senderName: currentUser.name,
              senderRole: currentUser.role,
              message: message.trim(),
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };

            const history = roomChatHistories.get(currentLiveClassId);
            if (history) {
              history.push(chatMsg);
              if (history.length > 200) history.shift();
            }

            const room = activeRooms.get(currentLiveClassId);
            if (room) {
              room.forEach((p) => {
                if (p.ws.readyState === WebSocket.OPEN) {
                  p.ws.send(
                    JSON.stringify({
                      type: 'chat_message',
                      chatMessage: chatMsg,
                    })
                  );
                }
              });
            }
            break;
          }

          // Raise Hand / Lower Hand
          case 'raise_hand': {
            if (!currentLiveClassId || !currentUser) return;
            const { raised } = msg;
            const room = activeRooms.get(currentLiveClassId);
            if (room && room.has(currentUser.id)) {
              const p = room.get(currentUser.id)!;
              p.hasRaisedHand = !!raised;

              room.forEach((other) => {
                if (other.ws.readyState === WebSocket.OPEN) {
                  other.ws.send(
                    JSON.stringify({
                      type: 'hand_raised',
                      userId: currentUser!.id,
                      userName: currentUser!.name,
                      raised: p.hasRaisedHand,
                      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    })
                  );
                }
              });
            }
            break;
          }

          // Teacher lowers a student's hand
          case 'lower_hand': {
            if (!currentLiveClassId || !currentUser || currentUser.role !== 'teacher') return;
            const { targetUserId } = msg;
            const room = activeRooms.get(currentLiveClassId);
            if (room && room.has(targetUserId)) {
              const p = room.get(targetUserId)!;
              p.hasRaisedHand = false;

              room.forEach((other) => {
                if (other.ws.readyState === WebSocket.OPEN) {
                  other.ws.send(
                    JSON.stringify({
                      type: 'hand_raised',
                      userId: targetUserId,
                      userName: p.userName,
                      raised: false,
                    })
                  );
                }
              });
            }
            break;
          }

          // Teacher mutes a participant
          case 'mute_participant': {
            if (!currentLiveClassId || !currentUser || currentUser.role !== 'teacher') return;
            const { targetUserId } = msg;
            const room = activeRooms.get(currentLiveClassId);
            if (room && room.has(targetUserId)) {
              const target = room.get(targetUserId)!;
              target.isMuted = true;
              if (target.ws.readyState === WebSocket.OPEN) {
                target.ws.send(JSON.stringify({ type: 'force_mute', message: 'You have been muted by the instructor.' }));
              }

              room.forEach((other) => {
                if (other.ws.readyState === WebSocket.OPEN) {
                  other.ws.send(
                    JSON.stringify({
                      type: 'participant_media_updated',
                      userId: targetUserId,
                      isMuted: true,
                      isCamOff: target.isCamOff,
                    })
                  );
                }
              });
            }
            break;
          }

          // Teacher removes a participant
          case 'remove_participant': {
            if (!currentLiveClassId || !currentUser || currentUser.role !== 'teacher') return;
            const { targetUserId } = msg;
            const room = activeRooms.get(currentLiveClassId);
            if (room && room.has(targetUserId)) {
              const target = room.get(targetUserId)!;
              if (target.ws.readyState === WebSocket.OPEN) {
                target.ws.send(JSON.stringify({ type: 'removed_from_class', message: 'You have been removed from this live class by the instructor.' }));
                target.ws.close(4004, 'Removed by instructor');
              }
              room.delete(targetUserId);

              room.forEach((other) => {
                if (other.ws.readyState === WebSocket.OPEN) {
                  other.ws.send(
                    JSON.stringify({
                      type: 'user_left',
                      userId: targetUserId,
                      userName: target.userName,
                    })
                  );
                }
              });
            }
            break;
          }

          // Teacher ends live class (Requirement #15 & #17)
          case 'end_live_class': {
            if (!currentLiveClassId || !currentUser || currentUser.role !== 'teacher') return;
            const liveClass = db.liveClasses.find((lc) => lc.id === currentLiveClassId);
            if (liveClass && liveClass.teacher_id === currentUser.id) {
              liveClass.status = 'ended';
              liveClass.ended_at = new Date().toISOString();
              db.persist();

              const room = activeRooms.get(currentLiveClassId);
              if (room) {
                room.forEach((p) => {
                  if (p.ws.readyState === WebSocket.OPEN) {
                    p.ws.send(
                      JSON.stringify({
                        type: 'class_ended',
                        message: 'The instructor has ended the live class session.',
                      })
                    );
                  }
                });
                room.clear();
              }
              activeRooms.delete(currentLiveClassId);
            }
            break;
          }

          default:
            break;
        }
      } catch (err) {
        console.error('WebSocket message parsing error:', err);
      }
    });

    ws.on('close', () => {
      if (currentLiveClassId && currentUser) {
        const room = activeRooms.get(currentLiveClassId);
        if (room && room.has(currentUser.id)) {
          const p = room.get(currentUser.id)!;
          room.delete(currentUser.id);

          // Update participant leave timestamp in database
          const record = db.liveParticipants.find(
            (part) => part.live_class_id === currentLiveClassId && part.user_id === currentUser!.id && !part.left_at
          );
          if (record) {
            record.left_at = new Date().toISOString();
            db.persist();
          }

          // Broadcast user_left
          room.forEach((other) => {
            if (other.ws.readyState === WebSocket.OPEN) {
              other.ws.send(
                JSON.stringify({
                  type: 'user_left',
                  userId: currentUser!.id,
                  userName: currentUser!.name,
                })
              );
            }
          });

          if (room.size === 0) {
            activeRooms.delete(currentLiveClassId);
          }
        }
      }
    });

    ws.on('error', (err) => {
      console.warn('WebSocket connection error:', err);
    });
  });

  return wss;
}
