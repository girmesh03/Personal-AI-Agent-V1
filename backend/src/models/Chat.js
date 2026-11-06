/**
 * @module models/Chat
 * @description Backward-compatibility bridge routing legacy V0 Chat model imports
 * to the modernized V1 Thread persistence model.
 */

import { Thread } from '../modules/conversations/persistence/Thread.js';

export const Chat = Thread;
export default Thread;
