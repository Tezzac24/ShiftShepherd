import {
  pausePushRegistrationOperations,
  resumePushRegistrationOperations,
  runPushRegistrationOperation,
} from '../pushRegistrationOperations';

const AUTH_USER_ID = 'auth-operation-test';

afterEach(() => {
  resumePushRegistrationOperations(AUTH_USER_ID);
});

describe('push registration operation coordination', () => {
  it('waits for active lifecycle work before completing a sign-out pause', async () => {
    let finish: () => void = () => undefined;
    const active = runPushRegistrationOperation(
      AUTH_USER_ID,
      () =>
        new Promise<string>((resolve) => {
          finish = () => resolve('done');
        }),
    );
    const paused = pausePushRegistrationOperations(AUTH_USER_ID);
    let pauseFinished = false;
    void paused.then(() => {
      pauseFinished = true;
    });
    await Promise.resolve();
    expect(pauseFinished).toBe(false);

    finish();
    await expect(active).resolves.toBe('done');
    await expect(paused).resolves.toBeUndefined();
  });

  it('skips new work while paused and permits it again after resume', async () => {
    await pausePushRegistrationOperations(AUTH_USER_ID);
    const operation = jest.fn(async () => 'ran');
    await expect(runPushRegistrationOperation(AUTH_USER_ID, operation)).resolves.toBeUndefined();
    expect(operation).not.toHaveBeenCalled();

    resumePushRegistrationOperations(AUTH_USER_ID);
    await expect(runPushRegistrationOperation(AUTH_USER_ID, operation)).resolves.toBe('ran');
  });
});
