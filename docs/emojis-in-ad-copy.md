# Emojis in ad copy: looked at, not switched on

Asked 2026-11-02: "consider adding emojis to the ad copy generator for statics and videos and everything ad copy; research if that would be better." The short answer is no by default, with a clean way to test it.

## What the evidence says

- **The famous numbers are old and thin.** The "241% higher CTR" figure is a 2016 A/B test by one startup (Scoro) on a headline. The "12 to 20% CTR" figures are vendor blogs quoting a 2017 WordStream test and each other. The one test with a cost column (AdEspresso) saw click-through rise 12% and cost per click rise with it. None isolates primary text, none is recent, none measures leads.
- **Controlled studies split by product type.** A field experiment on live Facebook and Instagram campaigns (Mladenović et al., 2021 working paper, published 2023) found emojis lifted results for hedonic products and had a marginal effect on utilitarian ones. Two later experiments found the same direction; one 2×2 experiment found a lift regardless of product type. A furnace repair, a water heater, a sewer line are utilitarian buys.
- **No intrusiveness penalty.** Lee, Kim and Lee (2021, MDPI Sustainability) found emojis in sponsored News Feed ads did not make them feel more intrusive.
- **Google Ads forbids them.** Google's Punctuation and symbols policy lists emoji as invalid or unsupported characters. Nothing we write for Search can carry one.
- **Meta allows them.** Meta's only emoji rule is in the profanity standard: no emoji that spells or hides a swear word. There is no cap, but a wall of symbols trips the spam-style review.
- **Readers and screen readers.** Screen readers speak every emoji by its Unicode name, so a stack is noise; dense emoji strings raise cognitive load; heavy emoji use is now a tell for AI-written copy, which costs an owner-voiced ad its credibility.
- **Our own account.** Of the 65 ads saved in the Ad Studio, none carries an emoji in its primary text or headline. The 44 ads the CRM published ran $4,269 for 270 leads, $16 a lead, all without. There is no in-house evidence either way and nothing broken to fix.

## What the CRM does now

- The Meta Ads Playbook (`src/lib/playbook.js`, in every client brief) has an EMOJIS section: none by default, and the rules for a test.
- The Ad Studio copy assistant (`supabase/functions/ad-copy`) has the same rule in its system prompt: no emoji unless the instruction asks; when it does, primary text only, one at most at the start of a line, never two in a row, never in the headline, the description or a painted slot, never standing in for a word, and the note says to run it against the plain version and judge on cost per lead.
- Video scripts are unchanged: spoken lines and on-screen text never carry one.

## How to test it

Open an ad in the Studio, type "add one emoji at the start of each primary text line" in the copy assistant, publish it as its own ad next to the plain one, and read cost per lead after a week of spend. If the emoji version wins on cost per lead across two or three accounts, the default can change; a click-through lift alone is not a reason.

## Sources

[Bestever on emojis in Facebook ads](https://www.bestever.ai/post/emojis-for-facebook-ads), [LeadEnforce on emojis and CTR](https://leadenforce.com/blog/do-emojis-really-improve-facebook-ad-ctr-what-you-need-to-know), [AdEspresso's emoji guide](https://adespresso.com/blog/how-to-use-emojis-in-facebook-ads-complete-guide/), [Mladenović et al., Emojis to conversion on social media (WORMS 21/13)](https://ideas.repec.org/p/ahh/wpaper/worms2113.html), [Lee, Kim and Lee 2021, MDPI Sustainability](https://www2.mdpi.com/2071-1050/13/9/4864), [Dmitrieva, Erasmus thesis](https://thesis.eur.nl/pub/50155/), [Acta Psychologica Sinica 2023](https://jps.ecnu.edu.cn/EN/Y2023/V46/I2/435), [Google Ads Punctuation and symbols policy](https://support.google.com/adspolicy/answer/14847994?hl=en), [Meta profanity standard](https://transparency.meta.com/policies/ad-standards/objectionable-content/profanity/), [Bureau of Internet Accessibility on emoji](https://boia.org/blog/using-emoji-could-be-excluding-people-from-your-conversation), [Pope Tech on emoji and screen readers](https://blog.pope.tech/2026/04/01/making-emojis-and-icons-screen-reader-accessible/).
