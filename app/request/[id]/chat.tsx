import { useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../../../src/lib/supabase';
import { useAuth } from '../../../src/lib/AuthProvider';
import { TextField } from '../../../src/components/TextField';
import { Button } from '../../../src/components/Button';
import { colors, radius, spacing } from '../../../src/constants/theme';
import type { Message } from '../../../src/types/database';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    supabase
      .from('messages')
      .select('*')
      .eq('request_id', id)
      .order('created_at', { ascending: true })
      .then(({ data }) => setMessages((data as Message[]) ?? []));

    const channel = supabase
      .channel(`chat-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `request_id=eq.${id}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const send = async () => {
    if (!session || !draft.trim()) return;
    setSending(true);
    const body = draft.trim();
    setDraft('');
    await supabase.from('messages').insert({ request_id: id, sender_id: session.user.id, body });
    setSending(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: spacing.md }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => {
          const mine = item.sender_id === session?.user.id;
          return (
            <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
              <Text style={mine ? styles.bubbleTextMine : styles.bubbleText}>{item.body}</Text>
            </View>
          );
        }}
      />
      <View style={styles.inputRow}>
        <TextField
          value={draft}
          onChangeText={setDraft}
          placeholder="Type a message…"
          style={{ flex: 1, marginBottom: 0 }}
        />
        <Button title="Send" onPress={send} loading={sending} disabled={!draft.trim()} style={styles.sendButton} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  bubble: { maxWidth: '80%', padding: spacing.sm, borderRadius: radius.md, marginBottom: spacing.sm },
  bubbleMine: { backgroundColor: colors.primary, alignSelf: 'flex-end' },
  bubbleTheirs: { backgroundColor: colors.surface, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.border },
  bubbleText: { color: colors.text },
  bubbleTextMine: { color: '#fff' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  sendButton: { minHeight: 46, paddingHorizontal: spacing.md },
});
