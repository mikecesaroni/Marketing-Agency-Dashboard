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
| Assignees            | names, several per task                                     |
| Tags                 | `tasks.tags`                                                |
| Comments             | `task_comments`                                             |
| List view, Board view| both, on the Tasks page                                     |
| Me mode              | "My tasks", keyed on the name set at the top right          |
| Quick add shorthand  | `!high @Name #tag due fri` on the end of a title            |

Left out on purpose: per-list statuses (the thing every ClickUp workspace
regrets), custom fields, time tracking, dependencies, recurring tasks, Gantt,
goals, docs. Each is a table or two when somebody asks for it.

## Using it

- **Add a task.** Type in the bar and press Enter. Whatever is selected in the
  sidebar is where it goes: a client, a list, or nowhere (the Inbox).
- **Shorthand.** `!urgent` `!high` `!low` set priority. `@Ethan` assigns.
  `#meta` tags. `due today`, `due tomorrow`, `due fri`, `due 2026-10-01` set
  the due date. Plain words are never read as flags.
- **Open a task** by clicking the row. Every field saves as you change it.
  Subtasks and checklist items are added with Enter. Comments post with the
  button or Ctrl/Cmd+Enter.
- **Done.** Tick the box on a row, drag the card to Done on the Board, or
  click Done in the task. Done tasks are hidden until "Show done" is ticked.
  A finished task is never counted overdue.
- **Your name.** "Set your name" at the top right. It is kept in this browser
  only (login is off) and is the same name the Deliverables board uses for
  who ticked a step. It signs tasks and comments and drives My tasks.
- **Lists.** "+ new" under Lists in the sidebar. Archiving a list keeps its
  tasks attached; there is no delete.

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
