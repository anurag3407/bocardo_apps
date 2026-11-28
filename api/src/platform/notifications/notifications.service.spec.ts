import { NotificationsService } from './notifications.service';

jest.mock('kysely', () => ({}));

function makeDb(tokens: string[]) {
  const deleted: unknown[] = [];
  const executeSelect = jest.fn().mockResolvedValue(tokens.map((token) => ({ token })));
  const executeDelete = jest.fn(async () => {
    deleted.push(true);
  });
  const selectChain = {
    innerJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: executeSelect,
  };
  const deleteChain = {
    where: jest.fn().mockReturnThis(),
    execute: executeDelete,
  };
  const db = {
    selectFrom: jest.fn().mockReturnValue(selectChain),
    deleteFrom: jest.fn().mockReturnValue(deleteChain),
  };
  return { db, deleteChain, executeDelete };
}

describe('NotificationsService', () => {
  it('sends via push provider and deletes invalid tokens returned by FCM', async () => {
    const { db, deleteChain, executeDelete } = makeDb(['tok-good', 'tok-bad']);
    const push = {
      send: jest.fn().mockResolvedValue({ invalidTokens: ['tok-bad'] }),
    };
    const svc = new NotificationsService(db as never, push);

    await svc.notifyUser('user-1', 'customer', {
      title: 'Order confirmed',
      body: 'Preparing your food',
    });

    expect(push.send).toHaveBeenCalledWith(['tok-good', 'tok-bad'], {
      title: 'Order confirmed',
      body: 'Preparing your food',
    });
    expect(db.deleteFrom).toHaveBeenCalledWith('device_tokens');
    expect(deleteChain.where).toHaveBeenCalledWith('token', 'in', ['tok-bad']);
    expect(executeDelete).toHaveBeenCalledTimes(1);
  });

  it('skips push provider when user has no registered device tokens', async () => {
    const { db } = makeDb([]);
    const push = { send: jest.fn() };
    const svc = new NotificationsService(db as never, push);

    await svc.notifyUser('user-1', 'customer', { title: 'Hi', body: 'There' });
    expect(push.send).not.toHaveBeenCalled();
  });
});
