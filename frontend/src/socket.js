let socket = null;

export function connectSocket() {
  socket = new WebSocket("ws://localhost:3001");

  socket.onopen = () => {
    console.log("WebSocket connected");
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log("Message from server:", data);
  };

  socket.onclose = () => {
    console.log("WebSocket disconnected");
  };

  return socket;
}
