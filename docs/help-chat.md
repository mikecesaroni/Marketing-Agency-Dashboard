# The help chat

Written 2026-10-14. A sticky "Help" button at the bottom right of every CRM page. Ask it how to do something and it answers from the in-app guide. Ask it to do something and it does it through the tools the page in front of you registers, then says what it did.

## What it can do

- Anywhere: find a client by name, open their page, open their Studio empty or already writing three ads ("Make 3 ads"), open their publish page, open any page by path.
- On a client page: open the Studio, the Publish tab or the client's own chat; start a batch of ads.
- In the Ad Studio: read what is on the artboards, change the words and colours, switch the look, pick a photo, save all three sizes, drive a batch (show one, save them all).
- On the publish page (and the Studio's Publish tab): see the clips and statics and what is ticked, tick or untick them, set the button, link, objective and budget, pick the destination ("all live ad sets", an existing campaign or ad sets, a new campaign), pick the instant form, add or remove a location, and press Publish.

"Finish what I started" is the point: it looks at the page, does the remaining steps, and stops at the first thing that needs a decision it was not given.

Pressing Publish always asks first: a card in the chat with "Do it" and "Not now". Everything the CRM creates in Meta is paused regardless.

## How it works

- `src/components/HelpChat.jsx` is the button and the panel, mounted once in `App.jsx` outside the routes so a conversation survives the page changes its own tools cause. It hides on the public token pages.
- `src/lib/helpActions.js` is the registry: a page or panel registers a scope with its tools and a state function through `useHelpActions` (`src/lib/useHelpActions.js`). `page_state` is always available and is the sum of every scope's state. The global tools are in `src/lib/helpGlobalActions.js`.
- `src/lib/helpBrief.js` builds the system prompt: the role and rules, then the whole guide from `src/lib/agentGuide.js` (so the chat knows every page, and a stale guide is a stale chat).
- `supabase/functions/crm-help` keeps the conversation (`help_chats`, `help_messages`, see `supabase/crm-help.sql`) and calls Claude once per request with the tools the browser sent. Tools run in the browser; the results go back as the next turn. A tool call left unanswered (the tab was closed) is closed out with an error before the next message so the history stays valid.
- Secrets: `ANTHROPIC_API_KEY`, the same one the client chat uses.
- Tested by `scripts/check-help-chat.mjs` (registry, matching, brief) and a browser run with a scripted function.

## Adding a tool

In the component that owns the thing, call `useHelpActions('scope', { label, state, tools })`. A tool is `{ name, description, input_schema, run(input), confirm?, confirmText? }`. `run` may be async and should return a small object; return `{ error }` for anything the model should read and recover from. Set `confirm: true` for anything that sends, spends or cannot be undone. Add a label for it in `toolLabel` in `helpBrief.js` so the transcript reads as a sentence.
