/// PrivAZy - a private messaging dapp on Aztec.
///
/// Every message is a private note encrypted to the recipient's keypair and committed to
/// Aztec chain state. No node, sequencer, or third party can decrypt a message; only the
/// recipient's private key can. There is no external database: the chain is the database.
///
/// Messages are discovered via non-interactive handshakes anchored in the canonical
/// HandshakeRegistry. The registry is deployed on this testnet, so the generated sync
/// discovers handshakes on-chain and any sender can reach a recipient without the
/// recipient ever knowing them in advance.
#[aztec::macros::aztec]
pub contract PrivAZy {
    use aztec::{
        macros::{functions::{external, initializer}, notes::note, storage::storage},
        messages::delivery::MessageDelivery,
        protocol::{address::AztecAddress, traits::{Deserialize, Packable, Serialize}},
        state_vars::{Owned, PrivateSet},
    };
    use aztec::note::{constants::MAX_NOTES_PER_PAGE, note_viewer_options::NoteViewerOptions};

    // A message note can carry up to MAX_NOTE_PACKED_LEN fields. Sender and timestamp take one
    // field each; the remaining fields carry the message content (~186 bytes of text).
    global CONTENT_FIELD_LEN: u32 = 6;

    #[derive(Deserialize, Eq, Packable, Serialize)]
    #[note]
    pub struct MessageNote {
        pub sender: AztecAddress,
        pub timestamp: u64,
        pub content: [Field; CONTENT_FIELD_LEN],
    }

    #[derive(Deserialize, Eq, Packable, Serialize)]
    #[note]
    pub struct OutboundNote {
        pub recipient: AztecAddress,
        pub timestamp: u64,
        pub content: [Field; CONTENT_FIELD_LEN],
    }

    #[storage]
    struct Storage<Context> {
        inbox: Owned<PrivateSet<MessageNote, Context>, Context>,
        outbox: Owned<PrivateSet<OutboundNote, Context>, Context>,
    }

    #[external("private")]
    #[initializer]
    fn constructor() {}

    /// Sends a private message to `to`. The note is encrypted to the recipient and committed
    /// on-chain; only `to`'s keys can ever decrypt it. A copy is stored in the sender's outbox
    /// so they can see their own sent messages.
    #[external("private")]
    fn send(to: AztecAddress, content: [Field; CONTENT_FIELD_LEN]) {
        let sender = self.msg_sender();
        let ts = self.context.get_anchor_block_header().timestamp();
        let note = MessageNote { sender, timestamp: ts, content };
        self.storage.inbox.at(to).insert(note).deliver(MessageDelivery::onchain_unconstrained().via_non_interactive_handshake());
        let out = OutboundNote { recipient: to, timestamp: ts, content };
        self.storage.outbox.at(sender).insert(out).deliver(MessageDelivery::onchain_unconstrained().via_non_interactive_handshake());
    }

    /// Replies privately to `to` with the sender as author, delivered straight into `to`'s inbox.
    /// A copy is stored in the sender's outbox.
    #[external("private")]
    fn reply(to: AztecAddress, content: [Field; CONTENT_FIELD_LEN]) {
        let sender = self.msg_sender();
        let ts = self.context.get_anchor_block_header().timestamp();
        let note = MessageNote { sender, timestamp: ts, content };
        self.storage.inbox.at(to).insert(note).deliver(MessageDelivery::onchain_unconstrained().via_non_interactive_handshake());
        let out = OutboundNote { recipient: to, timestamp: ts, content };
        self.storage.outbox.at(sender).insert(out).deliver(MessageDelivery::onchain_unconstrained().via_non_interactive_handshake());
    }

    /// Views the inbox of `owner`. Only the owner's keypair can decrypt these notes, so this
    /// returns an empty set for anyone else.
    #[external("utility")]
    unconstrained fn get_inbox(
        owner: AztecAddress,
    ) -> BoundedVec<MessageNote, MAX_NOTES_PER_PAGE> {
        let inbox = self.storage.inbox.at(owner);
        let options = NoteViewerOptions::<MessageNote, <MessageNote as Packable>::N>::new();
        inbox.view_notes(options)
    }

    /// Views the outbox of `owner` (messages they sent). Only the owner's keypair can decrypt
    /// these notes.
    #[external("utility")]
    unconstrained fn get_outbox(
        owner: AztecAddress,
    ) -> BoundedVec<OutboundNote, MAX_NOTES_PER_PAGE> {
        let outbox = self.storage.outbox.at(owner);
        let options = NoteViewerOptions::<OutboundNote, <OutboundNote as Packable>::N>::new();
        outbox.view_notes(options)
    }
}
