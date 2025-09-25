import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

admin.initializeApp();

// Simple health check endpoint so we can verify deployment works later.
export const ping = functions.region('asia-northeast1').https.onRequest((req, res) => {
  res.status(200).send({ ok: true, ts: Date.now() });
});

type RegisterPayload = {
  token?: string;
  platform?: string;
  userAgent?: string;
};

const ALLOWED_ORIGIN = '*';

function applyCors(req: functions.Request, res: functions.Response): boolean {
  res.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return true;
  }
  return false;
}

export const registerPushToken = functions.region('asia-northeast1').https.onRequest(async (req, res) => {
  if (applyCors(req, res)) {
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }
  const payload = (req.body ?? {}) as RegisterPayload;
  const token = payload.token?.trim();
  if (!token) {
    res.status(400).send('token is required');
    return;
  }

  try {
    const docRef = admin.firestore().collection('pushTokens').doc(token);
    const snapshot = await docRef.get();
    const data: Record<string, unknown> = {
      token,
      platform: payload.platform ?? 'unknown',
      userAgent: payload.userAgent ?? 'unknown',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (!snapshot.exists) {
      data.createdAt = admin.firestore.FieldValue.serverTimestamp();
    }
    await docRef.set(data, { merge: true });
    res.status(200).send({ ok: true });
  } catch (error) {
    console.error('registerPushToken error', error);
    res.status(500).send('failed to store token');
  }
});

export const sendTestNotification = functions.region('asia-northeast1').https.onRequest(async (req, res) => {
  if (applyCors(req, res)) {
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }
  const requestedToken = (req.body?.token as string | undefined)?.trim();

  try {
    let tokens: string[] = [];
    if (requestedToken) {
      tokens = [requestedToken];
    } else {
      const snapshot = await admin.firestore().collection('pushTokens').get();
      tokens = snapshot.docs.map((doc) => doc.id);
    }

    if (tokens.length === 0) {
      res.status(400).send('no tokens registered');
      return;
    }

    const message = {
      notification: {
        title: 'Stop Midnight',
        body: 'テスト通知が届きました！今日の計画を確認しましょう。',
      },
      data: {
        kind: 'test',
      },
      tokens,
    };

    const response = await admin.messaging().sendMulticast(message);
    res.status(200).send({ successCount: response.successCount, failureCount: response.failureCount });
  } catch (error) {
    console.error('sendTestNotification error', error);
    res.status(500).send('failed to send test notification');
  }
});
