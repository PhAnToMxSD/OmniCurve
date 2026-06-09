import { io, Socket } from 'socket.io-client'

const socket: Socket = io(import.meta.env.VITE_API_BASE_URL ?? '', {
  autoConnect: false,
  path: '/socket.io',
})

export function connectSocket() {
  if (!socket.connected) socket.connect()
}

export function joinMarket(id: string) {
  socket.emit('joinMarket', id)
}

export function leaveMarket(id: string) {
  socket.emit('leaveMarket', id)
}

export function requestPrice(p: { marketId: string; x: number; direction: 'yes' | 'no' }) {
  socket.emit('requestPrice', p)
}

export { socket }
