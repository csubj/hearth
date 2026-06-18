import {
  registerInventoryMaintenanceRemindersResource,
  registerMetricEntriesResource,
  registerProjectComponentsResource,
  registerResource,
} from "@/lib/api/openapi";

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
registerProjectComponentsResource();
registerInventoryMaintenanceRemindersResource();
