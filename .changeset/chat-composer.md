---
"carbide": patch
---

Messages typed while the assistant is replying are no longer swallowed, and the composer grows with what you write.

Pressing Enter during a reply appeared to send — the composer cleared — but nothing was sent and nothing was queued. The text was gone. Because the Send button is replaced by Stop while a reply streams, Enter was the only way to reach this, which is why it read as a message vanishing at random rather than as a disabled control.

A message sent mid-reply is now held, shown in the transcript as a pending bubble so you can see it is waiting, and sent when the reply finishes. If you **stop** the reply instead, the held message is returned to the composer as editable text rather than being sent or discarded — stopping says something about whether to send, not about whether you wanted the words. A reply that errors does the same. Switching conversations discards a held message rather than carrying it across, so it can never be sent into the wrong conversation.

Three other places that quietly ate a message now hand it back the same way: AI turned off, no provider configured, and a provider that does not support agent mode.

The composer also grows as you type, up to a maximum height, instead of staying two lines tall.
