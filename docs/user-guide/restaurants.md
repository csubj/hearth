# Restaurants

A shared wishlist of places to eat — and a household food journal after you visit.

## Browsing restaurants

Go to **Restaurants** (`/restaurants`). The list leads the page — what you want to try and where you've been. Adding a restaurant is a compact **New** button in the header, so the existing list stays the focus.

## Adding a restaurant

1. Use the **New restaurant** button in the header
2. Fill in:

| Field        | Required | Notes                                                |
| ------------ | -------- | ---------------------------------------------------- |
| Name         | Yes      | Restaurant name                                      |
| Neighborhood | No       | General area                                         |
| Address      | No       | Freeform address text                                |
| Notes        | No       | Why you want to go — "Emily said the pasta is great" |

New restaurants start with status **Want to try**.

## Statuses

| Status      | Meaning           |
| ----------- | ----------------- |
| Want to try | On the wishlist   |
| Visited     | You've been there |

## After a visit

When you visit a restaurant:

1. Open the restaurant detail page (`/restaurants/[id]`)
2. Mark it **Visited**
3. Optionally add:
   - **Rating** — 1–5 stars
   - **Visit note** — "get the lamb, skip the appetizer"
   - **Photos** — menu pics, food shots

Over time this becomes a household food journal, not just a todo list.

## Filtering and sorting

On the list page, filter and sort by:

- Status (want to try / visited)
- Neighborhood
- Rating (for visited)
- Date added

## Home page

The home restaurants section shows a few **want to try** suggestions. Click through to the full list.

## Map view

!!! note "Coming later"
A map view using Google Maps is planned but not in v1. Restaurants are list-only for now.

## @-mentions and photos

@-mention household members in notes or visit reviews. Attach photos on the detail page. See [Notifications & @-mentions](notifications-and-mentions.md) and [Attachments](attachments.md).
