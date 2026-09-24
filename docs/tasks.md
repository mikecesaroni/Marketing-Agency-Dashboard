# Tasks

The team's task board, in the sidebar as **Tasks**. Built to work the way
ClickUp does, sized for a five-person agency.

## How ClickUp is put together, and what we kept

ClickUp's hierarchy is Workspace > Space > Folder > List > Task > Subtask.
Tasks only ever live in a List. Each task carries a status, one or more
assignees, a priority (Urgent, High, Normal, Low), start and due dates, tags,
subtasks, a checklist, custom fields and a running comment log. Work is looked
at through views: List (grouped), Board (a column per status), Calendar,
Gantt, and a Home / "Me mode" that shows only your own tasks.

Mapped onto the CRM:

| ClickUp              | Here                                                        |
|----------------------|-------------------------------------------------------------|
| Workspace            | the CRM                                                     |
| Space / Folder       | not needed: the client roster is the structure              |
| List                 | every client is a list; `task_lists` holds the agency's own |
| Task                 | `tasks`                                                     |
| Subtask              | a task with `parent_id`, one level                          |
| Checklist            | `tasks.checklist`, JSON inside the task                     |
| Statuses             | one fixed set: To do, In progress, Review, Done             |
| Priority             | Urgent, High, Normal, Low                                   |
| Assignees            | team members (`team_members`), several per task             |
| Tags                 | `tasks.tags`                                                |
| Comments             | `task_comments`                                             |
| List view, Board view| both, on the Tasks page                                     |
| Me mode              | "My tasks", keyed on the name set at the top right          |
| Quick add shorthand  | `!high @Name #tag due fri` on the end of a title            |

Left out on purpose: per-list statuses (the thing every ClickUp workspace
regrets), custom fields, time tracking, dependencies, recurring tasks, Gantt,
goals, docs. Each is a table or two when somebody asks for it.

## The screen

Work here has two axes anyone cares about: **who** is doing it and **which
client** it is for. So the page is four views, not a folder tree:

| View     | What it shows                                                        |
|----------|----------------------------------------------------------------------|
| My day   | your tasks: overdue, today, tomorrow, this week, later               |
| Team     | one column per person; drag a card to hand it to someone else        |
| Clients  | grouped by client, then the agency lists, then the inbox             |
| All      | everything, as a list grouped five ways or a board by status         |

Above the views: three numbers (overdue, due today, open) and one quick-add
bar. Below them: an avatar chip per team member and a dropdown of clients and
lists. The chip and the dropdown are filters, and they are also **where a new
task goes**: on Maria's chip with Reliable selected, "Fix the form" is
Maria's task for Reliable. In My day a new task is yours and due today unless
you say otherwise. The page always opens on Team.

## Using it

- **Add a task.** Type in the bar, pick the client (or list) and the person
  in the two pickers beside it, press Enter. The pickers follow whatever is
  selected in the filters above, so on Reliable's tab a new task is already
  Reliable's, but they can be changed right in the bar without changing what
  you are looking at. Shorthand on the end of the line works too and wins
  over the pickers: `>reli` files it under Reliable (the start of any word in
  a client or list name; if two match, nothing is picked and the word stays
  in the title), `@Ethan` assigns, `!urgent` `!high` `!low` set priority,
  `#meta` tags, `due today`, `due tomorrow`, `due fri`, `due 2026-10-01` set
  the date. Plain words are never read as flags.
- **Open a task** by clicking it. Every field saves as you change it.
  Assignees are one chip per team member, click to toggle, with a box for
  someone not on the team. Subtasks and checklist items are added with Enter.
  Comments post with the button or Ctrl/Cmd+Enter.
- **Hand work over.** Team view, drag the card onto the other person. The
  person it left is swapped for the person it landed on; anyone else on the
  task stays.
- **Done.** Tick the box, drag the card to Done on the All board, or click
  Done in the task. Done tasks are hidden until "Show done" is ticked. A
  finished task is never counted overdue.
- **The team.** "Team" (or "Manage team") opens the roster: a name and what
  they do. Renaming a person renames them on every task at once; removing one
  takes them off the pickers and leaves the tasks they had alone. The roster
  is `team_members`, separate from CRM logins.
- **Your name.** "You:" at the top right, picked from the roster. Kept in this
  browser only (login is off), the same name the Deliverables board uses. It
  drives My day and signs tasks and comments.
- **Lists.** "+ list" next to the dropdown. Archiving a list keeps its tasks
  attached; there is no delete.

## What it is not

- Not the per-client onboarding checklist on the client page. That is
  `client_tasks`, fed by the chat's task extraction, and stays as it is.
- Not Deliverables, which tracks what was promised to a client and where the
  launch pipeline stands.

## Rules and checks

`src/lib/tasks.js` holds every rule that decides where a task shows: due
buckets, ordering, filters, grouping, the quick-add parser, the sidebar
counts. `scripts/check-tasks.mjs` pins them and checks the JS status and
priority lists against the constraints in `supabase/tasks.sql`.

Sources for the ClickUp model: the
[hierarchy intro](https://help.clickup.com/hc/en-us/articles/13856392825367-Intro-to-the-Hierarchy),
[Intro to Lists](https://help.clickup.com/hc/en-us/articles/6311877646999-Intro-to-Lists),
[Intro to tasks](https://help.clickup.com/hc/en-us/articles/10552031987735-Intro-to-tasks),
[task priorities](https://clickup.com/features/task-priorities) and
[the agency hierarchy guide from ZenPilot](https://www.zenpilot.com/blog/the-best-clickup-hierarchy-for-agencies/).
