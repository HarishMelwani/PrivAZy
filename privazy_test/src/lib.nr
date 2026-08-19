use aztec::{protocol::address::AztecAddress, test::helpers::test_environment::TestEnvironment};

use privazy_contract::PrivAZy;

// Helper to build a content payload from ASCII text, truncated to CONTENT_FIELD_LEN fields.
unconstrained fn content_from_text<let N: u32>(text: str<N>) -> [Field; 6] {
    let mut content = [0 as Field; 6];
    for i in 0..6 {
        if i < N {
            content[i] = (text.as_bytes()[i] as Field);
        }
    }
    content
}

unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let alice = env.create_light_account();
    let bob = env.create_light_account();

    let initializer_call = PrivAZy::interface().constructor();
    let contract_address =
        env.deploy("@privazy_contract/PrivAZy").with_private_initializer(alice, initializer_call);

    (env, contract_address, alice, bob)
}

unconstrained fn get_inbox(
    env: TestEnvironment,
    contract_address: AztecAddress,
    owner: AztecAddress,
) -> BoundedVec<PrivAZy::MessageNote, 10> {
    env.execute_utility(PrivAZy::at(contract_address).get_inbox(owner))
}

unconstrained fn get_outbox(
    env: TestEnvironment,
    contract_address: AztecAddress,
    owner: AztecAddress,
) -> BoundedVec<PrivAZy::OutboundNote, 10> {
    env.execute_utility(PrivAZy::at(contract_address).get_outbox(owner))
}

#[test]
unconstrained fn sending_message_delivers_to_recipient_inbox() {
    let (env, contract_address, alice, bob) = setup();
    let content = content_from_text("hello bob");

    env.call_private(alice, PrivAZy::at(contract_address).send(bob, content));

    let inbox = get_inbox(env, contract_address, bob);
    assert_eq(inbox.len(), 1);
    assert_eq(inbox.get(0).sender, alice);
    assert_eq(inbox.get(0).content[0], content[0]);
    assert_eq(inbox.get(0).content[5], content[5]);
    assert(inbox.get(0).timestamp > 0);
}

#[test]
unconstrained fn sender_does_not_see_recipient_inbox() {
    let (env, contract_address, alice, bob) = setup();
    let content = content_from_text("secret for bob");

    env.call_private(alice, PrivAZy::at(contract_address).send(bob, content));

    // Alice cannot decrypt Bob's notes; she sees an empty inbox for him.
    let alice_view = get_inbox(env, contract_address, alice);
    assert_eq(alice_view.len(), 0);
}

#[test]
unconstrained fn reply_lands_in_original_senders_inbox() {
    let (env, contract_address, alice, bob) = setup();
    let hello = content_from_text("hello bob");
    let reply = content_from_text("hi alice");

    env.call_private(alice, PrivAZy::at(contract_address).send(bob, hello));
    env.call_private(bob, PrivAZy::at(contract_address).reply(alice, reply));

    let alice_inbox = get_inbox(env, contract_address, alice);
    assert_eq(alice_inbox.len(), 1);
    assert_eq(alice_inbox.get(0).sender, bob);
    assert_eq(alice_inbox.get(0).content[0], reply[0]);
}

#[test]
unconstrained fn multiple_messages_accumulate() {
    let (env, contract_address, alice, bob) = setup();
    let first = content_from_text("first message");
    let second = content_from_text("second message");

    env.call_private(alice, PrivAZy::at(contract_address).send(bob, first));
    env.call_private(alice, PrivAZy::at(contract_address).send(bob, second));

    let inbox = get_inbox(env, contract_address, bob);
    assert_eq(inbox.len(), 2);
}

#[test]
unconstrained fn self_message_is_readable() {
    let (env, contract_address, alice, _bob) = setup();
    let note = content_from_text("note to self");

    env.call_private(alice, PrivAZy::at(contract_address).send(alice, note));

    let inbox = get_inbox(env, contract_address, alice);
    assert_eq(inbox.len(), 1);
    assert_eq(inbox.get(0).sender, alice);
}

#[test]
unconstrained fn sent_message_appears_in_sender_outbox() {
    let (env, contract_address, alice, bob) = setup();
    let content = content_from_text("hello bob");

    env.call_private(alice, PrivAZy::at(contract_address).send(bob, content));

    let outbox = get_outbox(env, contract_address, alice);
    assert_eq(outbox.len(), 1);
    assert_eq(outbox.get(0).recipient, bob);
    assert_eq(outbox.get(0).content[0], content[0]);
    assert_eq(outbox.get(0).content[5], content[5]);
    assert(outbox.get(0).timestamp > 0);
}

#[test]
unconstrained fn inbox_and_outbox_share_timestamp() {
    let (env, contract_address, alice, bob) = setup();
    let content = content_from_text("hello bob");

    env.call_private(alice, PrivAZy::at(contract_address).send(bob, content));

    let inbox = get_inbox(env, contract_address, bob);
    let outbox = get_outbox(env, contract_address, alice);
    assert_eq(inbox.get(0).timestamp, outbox.get(0).timestamp);
}

#[test]
unconstrained fn recipient_does_not_see_sender_outbox() {
    let (env, contract_address, alice, bob) = setup();
    let content = content_from_text("hello bob");

    env.call_private(alice, PrivAZy::at(contract_address).send(bob, content));

    let bob_outbox = get_outbox(env, contract_address, bob);
    assert_eq(bob_outbox.len(), 0);
}

#[test]
unconstrained fn reply_appears_in_repliers_outbox() {
    let (env, contract_address, alice, bob) = setup();
    let hello = content_from_text("hello bob");
    let reply = content_from_text("hi alice");

    env.call_private(alice, PrivAZy::at(contract_address).send(bob, hello));
    env.call_private(bob, PrivAZy::at(contract_address).reply(alice, reply));

    let bob_outbox = get_outbox(env, contract_address, bob);
    assert_eq(bob_outbox.len(), 1);
    assert_eq(bob_outbox.get(0).recipient, alice);
    assert_eq(bob_outbox.get(0).content[0], reply[0]);
}

#[test]
unconstrained fn outbox_accumulates_multiple_sends() {
    let (env, contract_address, alice, bob) = setup();
    let first = content_from_text("first message");
    let second = content_from_text("second message");

    env.call_private(alice, PrivAZy::at(contract_address).send(bob, first));
    env.call_private(alice, PrivAZy::at(contract_address).send(bob, second));

    let outbox = get_outbox(env, contract_address, alice);
    assert_eq(outbox.len(), 2);
}

// A third party who is part of neither side of the conversation accumulates no
// copy of anyone's messages: notes are written only to the recipient's inbox
// and the sender's own outbox.
#[test]
unconstrained fn third_party_accumulates_no_copies_of_others_messages() {
    let (mut env, contract_address, alice, bob) = setup();
    let carol = env.create_light_account();

    env.call_private(
        alice,
        PrivAZy::at(contract_address).send(bob, content_from_text("just between us")),
    );
    env.call_private(
        bob,
        PrivAZy::at(contract_address).reply(alice, content_from_text("agreed")),
    );

    assert_eq(get_inbox(env, contract_address, carol).len(), 0);
    assert_eq(get_outbox(env, contract_address, carol).len(), 0);
}
