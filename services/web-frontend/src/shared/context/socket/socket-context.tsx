import {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useRef,
  type ReactNode
} from 'react';
import { io, type Socket } from 'socket.io-client';
import { SOCKET_URL } from '@/shared/lib/constants';
import { useKeycloak } from '@/shared/hooks/useKeycloak';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false
});

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { token, isAuthenticated } = useKeycloak();
  const socketRef = useRef<Socket | null>(null);

  // Connect once when authenticated, disconnect when logged out
  useEffect(() => {
    if (!isAuthenticated) {
      // User logged out — disconnect
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    // User is authenticated but socket doesn't exist — connect
    if (!socketRef.current && token) {
      const newSocket = io(SOCKET_URL, {
        auth: { authorization: `Bearer ${token}` },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
        randomizationFactor: 0.5 // Jitter to prevent thundering herd
      });

      newSocket.on('connect', () => {
        console.log('[WebSocket] Connected');
        setIsConnected(true);
      });

      newSocket.on('disconnect', () => {
        console.log('[WebSocket] Disconnected');
        setIsConnected(false);
      });

      newSocket.on('connect_error', error => {
        console.error('[WebSocket] Connection error:', error);
      });

      socketRef.current = newSocket;
      setSocket(newSocket);
    }

    return () => {
      // Only disconnect on unmount, not on token change
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]); // ONLY depend on isAuthenticated, NOT token (intentional - avoid reconnect on token refresh)

  // Update auth token WITHOUT reconnecting
  useEffect(() => {
    if (socketRef.current && token && isAuthenticated) {
      // Update the auth header for future reconnections
      (socketRef.current.io.opts as Record<string, unknown>).auth = {
        authorization: `Bearer ${token}`
      };
    }
  }, [token, isAuthenticated]);

  const value = useMemo(() => ({ socket, isConnected }), [socket, isConnected]);

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useSocket = () => useContext(SocketContext);
