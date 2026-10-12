# Newsletter checklist format

Each Friday's programme newsletter is turned into a checklist and pasted as JSON
in **Admin → 📰 Newsletters → ＋ Add**. Publishing a second newsletter for the
same `week_of` replaces the first; ticks on items that keep the same `id` stay.

```json
{
  "title": "MPP Newsletter · Friday 9 October",
  "week_of": "2026-10-12",
  "intro": "Two or three short paragraphs: what matters this week.",
  "items": [
    {
      "id": "apm-survey",
      "category": "To do",
      "title": "Choose your Applied Policy Modules",
      "summary": "One or two lines shown in the list.",
      "detail": "Full detail for the pop-up.\n\nBlank lines separate paragraphs.",
      "due": "2026-10-13",
      "when": "Closes Tue 13 Oct, 12:00 noon",
      "links": [{ "label": "APM survey", "url": "https://…" }]
    }
  ]
}
```

- `id`: short, unique within the newsletter, and stable (ticks are stored by it).
- `category`: items are grouped by it, in the order they first appear
  (e.g. To do · Professional Skills · register · Events · Good to know · Wellbeing).
- `due` (optional): deadline as `YYYY-MM-DD`; drives the colour and the "next deadline" on the home card.
- `when` (optional): time and place as free text.
- `links` (optional): only `http(s):` and `mailto:` links are shown.

Before publishing, remove anything personal from the source email: the
recipient's address in the footer and the subscriber code in tracking links
(the `e=…` parameter of `list-manage.com` links). Newsletter content is not
committed to this public repository.
