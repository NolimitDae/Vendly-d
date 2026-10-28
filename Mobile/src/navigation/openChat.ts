import { Alert } from 'react-native';
import { ChatService } from '../services/chat.service';
import { openInTab } from './crossTab';

/** Starts (or reopens) a conversation with a vendor and jumps to it in the Messages tab. */
export async function openChatWith(nav: { navigate: (...args: any[]) => void }, participantId: string, participantName: string) {
  try {
    const res = await ChatService.createConversation({ participant_id: participantId });
    const id = res.data?.data?.id;
    if (!res.data?.success || !id) throw new Error();
    openInTab(nav, 'MessagesTab', 'ChatDetail', { conversationId: id, participantName });
  } catch (err: any) {
    // the server's reason when it has one (e.g. it's your own account), otherwise a plain retry
    const reason = err?.response?.data?.message;
    Alert.alert('Could not open chat', typeof reason === 'string' ? reason : 'Try again in a moment.');
  }
}
