import { registerMetricEntriesResource, registerResource } from "@/lib/api/openapi";

registerResource({
  tag: "Stream",
  basePath: "/api/v1/stream",
  entityName: "StreamEntry",
});

registerResource({
  tag: "Restaurants",
  basePath: "/api/v1/restaurants",
  entityName: "Restaurant",
});

registerResource({
  tag: "Projects",
  basePath: "/api/v1/projects",
  entityName: "Project",
});

registerResource({
  tag: "Metrics",
  basePath: "/api/v1/metrics",
  entityName: "Metric",
});

registerResource({
  tag: "Events",
  basePath: "/api/v1/events",
  entityName: "Event",
});

registerResource({
  tag: "Inventory",
  basePath: "/api/v1/inventory",
  entityName: "InventoryItem",
});

registerResource({
  tag: "Inventory",
  basePath: "/api/v1/inventory/tags",
  entityName: "InventoryTag",
});

registerResource({
  tag: "Inventory",
  basePath: "/api/v1/inventory/types",
  entityName: "InventoryType",
});

registerMetricEntriesResource();
