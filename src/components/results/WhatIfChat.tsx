import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatMessage {
  id: string;
  role: 'system' | 'adviser';
  content: string;
}

interface WhatIfChatProps {
  initialAnalysis: string;
}

export default function WhatIfChat({ initialAnalysis }: WhatIfChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [analysisContent] = useState(() => initialAnalysis);

  // Keep analysis in sync but don't auto-display
  const latestAnalysis = useRef(initialAnalysis);
  useEffect(() => {
    latestAnalysis.current = initialAnalysis;
  }, [initialAnalysis]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    const adviserMsg: ChatMessage = { id: Date.now().toString(), role: 'adviser', content: text };
    const replyMsg: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'system',
      content: 'Claude AI analysis coming soon. For now review the what-if breakdown above.',
    };
    setMessages(prev => [...prev, adviserMsg, replyMsg]);
    setInput('');
  };

  return (
    <div className="flex flex-col h-full border rounded-lg bg-background overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-primary text-primary-foreground">
        <MessageSquare className="h-4 w-4" />
        <span className="font-semibold text-sm">What-If Analysis</span>
      </div>

      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-3">
          {messages.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              Ask a what-if question to start the analysis…
            </p>
          )}
          {messages.map(msg => (
            <div key={msg.id} className={cn('flex', msg.role === 'adviser' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-line',
                  msg.role === 'adviser'
                    ? 'bg-[#1B2A4A] text-white rounded-br-md'
                    : 'bg-[#E8E4DC] text-foreground rounded-bl-md'
                )}
              >
                {msg.content}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="flex items-center gap-2 p-3 border-t">
        <Input
          placeholder="Ask a what-if question…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          className="flex-1"
        />
        <Button size="icon" onClick={handleSend} disabled={!input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
