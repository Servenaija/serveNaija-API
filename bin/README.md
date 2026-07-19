# Real-Time Chat System
A robust real-time chat system built with Node.js, Socket.io, and MongoDB that enables seamless communication between users (customers, vendors, riders) and admin support staff.

# Features
Real-time Messaging: Instant message delivery using WebSockets

Multi-role Support: Users, Vendors, Riders, and multiple Admin types

Smart Conversation Assignment: Automatic and manual conversation assignment

Security: User banning, authentication, and input validation

Real-time Updates: Live conversation lists and typing indicators

REST API: Additional endpoints for data management

 # System Architecture
User Roles

Role	    Description	            Permissions

User	    Regular customer	    Can start conversations

Vendor	    Service provider	    Can start conversations

Rider	    Delivery personnel	    Can start conversations

Support	    Basic support staff	    Can respond to conversations

Moderator	Limited admin access	Can respond and manage conversations

Superadmin	Full system access	    Full administrative privileges




# javascript

socket.emit('register', {
  userId: "user123",
  role: "user" // user, vendor, rider, superadmin, moderator, support
});
Send Message

// New conversation
socket.emit('sendMessage', {
  message: "Hello, I need help"
});

// Existing conversation
socket.emit('sendMessage', {
  message: "Thanks for helping",
  conversationId: "conv123"
});
Fetch Data

javascript
// Get conversation messages
socket.emit('fetchConversationMessages', "conv123");

// Get user conversations
socket.emit('fetchMyConversations');

// Get admin conversations
socket.emit('fetchAdminConversations');

// Assign conversation (admin only)
socket.emit('assignToMe', "conv123");
Server Events (Receive)
Receive Messages


socket.on('receiveMessage', (message) => {
  console.log(message);
  // {
  //   _id: "msg123",
  //   from: { fullName: "John", profilePicture: "url" },
  //   message: "Hello there",
  //   senderType: "user",
  //   createdAt: "2024-01-15T10:30:00Z"
  // }
});
Conversation Lists


socket.on('conversationsList', (conversations) => {
  // Array of conversation objects
});

socket.on('conversationUpdated', (conversation) => {
  // Real-time conversation updates
});
REST API Endpoints
Get Messages

http
GET /api/chat/messages?conversationId=conv123
Get Conversations

http
GET /api/chat/conversations?status=pending&assignedToMe=true
Mark as Resolved

http
PATCH /api/chat/conversations/:conversationId/resolve
Ban User

http
POST /api/chat/ban
Content-Type: application/json

{
  "email": "user@example.com",
  "type": "user"
}

Conversation
javascript
{
  _id: ObjectId,
  user: ObjectId,           // Reference to User
  vendor: ObjectId,         // Reference to Vendor  
  rider: ObjectId,          // Reference to Rider
  assignedAdmin: ObjectId,  // Reference to Admin
  status: "pending" | "in-progress" | "resolved",
  lastMessage: String,
  lastMessageTime: Date,
  createdAt: Date,
  updatedAt: Date
}

Message
javascript
{
  _id: ObjectId,
  from: ObjectId,           // Sender reference
  to: ObjectId,             // Receiver reference
  message: String,
  senderType: "user" | "vendor" | "rider" | "admin",
  receiverType: "user" | "vendor" | "rider" | "admin",
  conversationId: ObjectId,
  read: Boolean,
  createdAt: Date
}
 Security Features

User Banning: Banned users cannot send messages

Input Validation: All data validated before processing

Conversation Lock: Only assigned admins can respond to in-progress conversations

Role-based Access: Different permissions for different user types

Usage Examples
# Frontend Implementation
User/Vendor/Rider Side

javascript
// Connect to chat
socket.emit('register', { userId: user._id, role: 'user' });

// Load conversations
socket.emit('fetchMyConversations');

// Send message
socket.emit('sendMessage', { message: "Hello, I need help" });

// Listen for messages
socket.on('receiveMessage', (message) => {
  addMessageToChat(message);
});
Admin Side

javascript
// Connect as admin
socket.emit('register', { userId: admin._id, role: 'support' });

// Load all conversations
socket.emit('fetchAdminConversations');

// Assign conversation
socket.emit('assignToMe', conversationId);

// Respond to user
socket.emit('sendMessage', {
  to: userId,
  message: "How can I help?",
  conversationId: conversationId
});

# Workflow
User starts conversation → Message broadcast to all online admins

Admin responds → Conversation automatically assigned to that admin

Continued communication → Only between assigned admin and user

Resolution → Admin marks conversation as resolved





# Troubleshooting
Common Issues:

Socket not connecting

Check JWT token validity

Verify server is running

Check CORS configuration

Messages not sending

Verify user is not banned

Check conversation exists

Validate message format

Real-time updates not working

Ensure event listeners are set up

Check socket connection status

Verify user permissions

Monitoring
The system provides real-time monitoring of:

Online admin count

Conversation status distribution

Support availability status

User connection states




