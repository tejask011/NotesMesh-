import { SaveQueue } from './saveQueue';
import { WorkspaceStorage } from './workspaceStorage';

export const storage = new WorkspaceStorage();
export const saveQueue = new SaveQueue(storage);
