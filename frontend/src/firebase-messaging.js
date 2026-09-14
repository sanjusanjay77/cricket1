import { getMessaging } from 'firebase/messaging';
import app from './firebase';

const messaging = getMessaging(app);

export default messaging;
