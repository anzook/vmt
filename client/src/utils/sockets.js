import io from 'socket.io-client';


const socket = io.connect(process.env.REACT_APP_SERVER_URL);
socket.removeAllListeners()
export default socket;
