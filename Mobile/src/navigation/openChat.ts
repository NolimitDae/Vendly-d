import { Alert } from 'react-native';
import { ChatService } from '../services/chat.service';

/** Starts (or reopens) a conversation with a vendor and jumps to it in the Messages tab. */
export async function openChatWith(nav: { navigate: (...args: any[]) => void }, participantId: string, participantName: string) {
  try {
    const res = await ChatService.createConversation({ participant_id: participantId });
    const id = res.data?.data?.id;
    if (!res.data?.success || !id) throw new Error();
    nav.navigate('MessagesTab', { screen: 'ChatDetail', params: { conversationId: id, participantName }, initial: false });
  } catch {
    Alert.alert('Could not open chat', 'Try again in a moment.');
  }
}
