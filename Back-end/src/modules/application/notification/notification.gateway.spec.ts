import * as jwt from 'jsonwebtoken';
import appConfig from '../../../config/app.config';
import { NotificationGateway, socketUserId } from './notification.gateway';

const secret = appConfig().jwt.secret;
const sock = (handshake: any) => ({ handshake: { headers: {}, auth: {}, query: {}, ...handshake }, data: {} as any, id: 's1', join: jest.fn() });

describe('notification sockets', () => {
  it('knows a user only from a verified token, never from a user id the client sends', () => {
    expect(socketUserId(sock({ query: { userId: 'victim' } }) as any)).toBeNull();
    expect(socketUserId(sock({ auth: { token: 'not-a-jwt' } }) as any)).toBeNull();
    expect(socketUserId(sock({ auth: { token: jwt.sign({ sub: 'u1' }, 'wrong-secret') } }) as any)).toBeNull();
    expect(socketUserId(sock({ auth: { token: jwt.sign({ sub: 'u1', typ: 'refresh' }, secret) } }) as any)).toBeNull();
    expect(socketUserId(sock({ auth: { token: jwt.sign({ sub: 'u1', typ: 'socket' }, secret) } }) as any)).toBe('u1');
    expect(socketUserId(sock({ headers: { authorization: `Bearer ${jwt.sign({ sub: 'u2' }, secret)}` } }) as any)).toBe('u2');
  });

  it('puts a signed-in socket in its own room and ignores the rest', async () => {
    const gw = new NotificationGateway({ remove: jest.fn() } as any);
    const good = sock({ auth: { token: jwt.sign({ sub: 'u1' }, secret) } });
    await gw.handleConnection(good as any);
    expect(good.join).toHaveBeenCalledWith('user_u1');
    const spoof = sock({ query: { userId: 'u1' } });
    await gw.handleConnection(spoof as any);
    expect(spoof.join).not.toHaveBeenCalled();
  });

  it('removes notifications only as the signed-in user', async () => {
    const remove = jest.fn().mockResolvedValue({ success: true });
    const gw = new NotificationGateway({ remove } as any);
    const s = sock({ query: { userId: 'victim' } });
    s.data.userId = 'u1';
    await gw.remove('n1', s as any);
    expect(remove).toHaveBeenCalledWith('n1', 'u1');
    remove.mockClear();
    expect(await gw.remove('n1', sock({ query: { userId: 'victim' } }) as any)).toMatchObject({ success: false });
    expect(remove).not.toHaveBeenCalled();
  });
});
