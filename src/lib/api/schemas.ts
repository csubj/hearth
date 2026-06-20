import { z } from "zod";
import { restaurantStatuses } from "@/db/schema/restaurants";
import { PROJECT_COMPONENT_KINDS, PROJECT_STATUSES } from "@/db/schema/projects";

const isoDateTime = z.string().datetime();

export const restaurantSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  neighborhood: z.string().nullable(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
  status: z.enum(restaurantStatuses),
  rating: z.number().int().min(1).max(5).nullable(),
  visitNote: z.string().nullable(),
  visitedAt: isoDateTime.nullable(),
  createdByUserId: z.string().uuid(),
  updatedByUserId: z.string().uuid(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const createRestaurantSchema = z.object({
  name: z.string().min(1).max(200),
  neighborhood: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  notes: z.string().max(5000).optional(),
  status: z.enum(restaurantStatuses).optional(),
});

export const updateRestaurantSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  neighborhood: z.string().max(200).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  status: z.enum(restaurantStatuses).optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  visitNote: z.string().max(5000).nullable().optional(),
  visitedAt: isoDateTime.nullable().optional(),
});

export const projectSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  notes: z.string().nullable(),
  status: z.enum(PROJECT_STATUSES),
  priority: z.number().int().min(1).max(5).nullable(),
  targetWhen: z.string().nullable(),
  budgetCents: z.number().int().nullable(),
  createdByUserId: z.string().uuid(),
  updatedByUserId: z.string().uuid(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const createProjectSchema = z.object({
  title: z.string().min(1).max(200),
  notes: z.string().max(10_000).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  priority: z.number().int().min(1).max(5).nullable().optional(),
  targetWhen: z.string().max(200).nullable().optional(),
  budgetCents: z.number().int().min(0).nullable().optional(),
});

export const updateProjectSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  notes: z.string().max(10_000).nullable().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  priority: z.number().int().min(1).max(5).nullable().optional(),
  targetWhen: z.string().max(200).nullable().optional(),
  budgetCents: z.number().int().min(0).nullable().optional(),
});

export const projectComponentSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string(),
  kind: z.enum(PROJECT_COMPONENT_KINDS),
  quantity: z.number().int().min(1),
  unitCostCents: z.number().int().min(0),
  acquired: z.boolean(),
  acquiredAt: isoDateTime.nullable(),
  purchaseUrl: z.string().nullable(),
  sortOrder: z.number().int(),
  note: z.string().nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const createProjectComponentSchema = z.object({
  name: z.string().min(1).max(200),
  kind: z.enum(PROJECT_COMPONENT_KINDS).optional(),
  quantity: z.number().int().min(1).max(9999).optional(),
  unitCostCents: z.number().int().min(0).optional(),
  purchaseUrl: z.string().url().max(2000).optional(),
  note: z.string().max(500).optional(),
  acquired: z.boolean().optional(),
});

export const updateProjectComponentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  kind: z.enum(PROJECT_COMPONENT_KINDS).optional(),
  quantity: z.number().int().min(1).max(9999).optional(),
  unitCostCents: z.number().int().min(0).optional(),
  purchaseUrl: z.string().url().max(2000).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  acquired: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const metricReminderUnitApiSchema = z.enum(["day", "week", "month", "year"]);

export const metricSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  unit: z.string().nullable(),
  reminderIntervalCount: z.number().int().nullable(),
  reminderIntervalUnit: metricReminderUnitApiSchema.nullable(),
  reminderRecipientUserId: z.string().uuid().nullable(),
  lastReminderAt: isoDateTime.nullable(),
  createdByUserId: z.string().uuid(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const createMetricSchema = z.object({
  name: z.string().min(1).max(200),
  unit: z.string().max(50).optional(),
  reminderIntervalCount: z.number().int().min(1).max(999).optional().nullable(),
  reminderIntervalUnit: metricReminderUnitApiSchema.optional().nullable(),
  reminderRecipientUserId: z.string().uuid().optional().nullable(),
});

export const updateMetricSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  unit: z.string().max(50).nullable().optional(),
  reminderIntervalCount: z.number().int().min(1).max(999).optional().nullable(),
  reminderIntervalUnit: metricReminderUnitApiSchema.optional().nullable(),
  reminderRecipientUserId: z.string().uuid().optional().nullable(),
});

export const metricEntrySchema = z.object({
  id: z.string().uuid(),
  metricId: z.string().uuid(),
  value: z.string(),
  note: z.string().nullable(),
  recordedAt: isoDateTime,
  createdByUserId: z.string().uuid(),
  createdAt: isoDateTime,
});

export const createMetricEntrySchema = z.object({
  value: z.string().min(1).max(500),
  note: z.string().max(5000).optional(),
  recordedAt: isoDateTime.optional(),
});

export const updateMetricEntrySchema = z.object({
  value: z.string().min(1).max(500).optional(),
  note: z.string().max(5000).nullable().optional(),
  recordedAt: isoDateTime.optional(),
});

export const inventoryTagSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  createdAt: isoDateTime,
});

export const createInventoryTagSchema = z.object({
  name: z.string().min(1).max(100),
});

export const updateInventoryTagSchema = z.object({
  name: z.string().min(1).max(100),
});

export const inventoryTypeSchema = z.object({
  name: z.string(),
});

export const renameInventoryTypeSchema = z.object({
  name: z.string().min(1).max(100),
});

export const inventoryItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  serial: z.string().nullable(),
  itemType: z.string().nullable(),
  location: z.string().nullable(),
  purchaseDate: isoDateTime.nullable(),
  store: z.string().nullable(),
  price: z.string().nullable(),
  warrantyNote: z.string().nullable(),
  notes: z.string().nullable(),
  createdByUserId: z.string().uuid(),
  updatedByUserId: z.string().uuid(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  tags: z.array(inventoryTagSchema).optional(),
});

export const createInventoryItemSchema = z.object({
  name: z.string().min(1).max(200),
  brand: z.string().max(200).optional(),
  model: z.string().max(200).optional(),
  serial: z.string().max(200).optional(),
  itemType: z.string().max(100).optional(),
  location: z.string().max(200).optional(),
  purchaseDate: isoDateTime.optional(),
  store: z.string().max(200).optional(),
  price: z.string().max(50).optional(),
  warrantyNote: z.string().max(2000).optional(),
  notes: z.string().max(5000).optional(),
  tags: z.array(z.string().min(1).max(100)).optional(),
});

export const updateInventoryItemSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  brand: z.string().max(200).nullable().optional(),
  model: z.string().max(200).nullable().optional(),
  serial: z.string().max(200).nullable().optional(),
  itemType: z.string().max(100).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  purchaseDate: isoDateTime.nullable().optional(),
  store: z.string().max(200).nullable().optional(),
  price: z.string().max(50).nullable().optional(),
  warrantyNote: z.string().max(2000).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  tags: z.array(z.string().min(1).max(100)).optional(),
});

const maintenanceReminderLinkSchema = z.object({
  label: z.string().min(1).max(200),
  url: z.string().url().max(2000),
});

export const inventoryMaintenanceReminderLinkSchema = maintenanceReminderLinkSchema.extend({
  id: z.string().uuid(),
  createdAt: isoDateTime,
});

export const inventoryMaintenanceReminderSchema = z.object({
  id: z.string().uuid(),
  inventoryItemId: z.string().uuid(),
  title: z.string(),
  notes: z.string().nullable(),
  reminderIntervalCount: z.number().int().nullable(),
  reminderIntervalUnit: metricReminderUnitApiSchema.nullable(),
  reminderRecipientUserId: z.string().uuid().nullable(),
  lastCompletedAt: isoDateTime.nullable(),
  lastReminderAt: isoDateTime.nullable(),
  createdByUserId: z.string().uuid(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  links: z.array(inventoryMaintenanceReminderLinkSchema),
});

export const createInventoryMaintenanceReminderSchema = z.object({
  title: z.string().min(1).max(200),
  notes: z.string().max(5000).nullable().optional(),
  reminderIntervalCount: z.number().int().min(1).max(999).optional().nullable(),
  reminderIntervalUnit: metricReminderUnitApiSchema.optional().nullable(),
  reminderRecipientUserId: z.string().uuid().optional().nullable(),
  links: z.array(maintenanceReminderLinkSchema).optional(),
});

export const updateInventoryMaintenanceReminderSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  notes: z.string().max(5000).nullable().optional(),
  reminderIntervalCount: z.number().int().min(1).max(999).optional().nullable(),
  reminderIntervalUnit: metricReminderUnitApiSchema.optional().nullable(),
  reminderRecipientUserId: z.string().uuid().optional().nullable(),
});

export const maintenanceLogSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  notes: z.string().nullable(),
  category: z.string().nullable(),
  company: z.string().nullable(),
  costCents: z.number().int().nullable(),
  startedAt: isoDateTime.nullable(),
  completedAt: isoDateTime.nullable(),
  createdByUserId: z.string().uuid(),
  updatedByUserId: z.string().uuid(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  tags: z.array(z.string()),
});

export const createMaintenanceLogSchema = z.object({
  title: z.string().min(1).max(200),
  notes: z.string().max(10_000).optional(),
  category: z.string().max(100).optional(),
  company: z.string().max(200).optional(),
  costCents: z.number().int().min(0).optional().nullable(),
  startedAt: isoDateTime.optional(),
  completedAt: isoDateTime.optional(),
  tags: z.array(z.string().min(1).max(100)).optional(),
});

export const updateMaintenanceLogSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  notes: z.string().max(10_000).nullable().optional(),
  category: z.string().max(100).nullable().optional(),
  company: z.string().max(200).nullable().optional(),
  costCents: z.number().int().min(0).nullable().optional(),
  startedAt: isoDateTime.nullable().optional(),
  completedAt: isoDateTime.nullable().optional(),
  tags: z.array(z.string().min(1).max(100)).optional(),
});

// Home Log

const homeSpaceKinds = ["property", "structure", "room", "area"] as const;
const homeItemKinds = [
  "paint",
  "appliance",
  "electrical",
  "plumbing",
  "fixture",
  "flooring",
  "window_treatment",
  "generic",
] as const;

export const homeSpaceSchema = z.object({
  id: z.string().uuid(),
  parentId: z.string().uuid().nullable(),
  kind: z.enum(homeSpaceKinds),
  name: z.string(),
  address: z.string().nullable(),
  notes: z.string().nullable(),
  sortOrder: z.number().int(),
  createdByUserId: z.string().uuid(),
  updatedByUserId: z.string().uuid(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const createHomeSpaceSchema = z.object({
  name: z.string().min(1).max(200),
  kind: z.enum(homeSpaceKinds).optional(),
  parentId: z.string().uuid().nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  notes: z.string().max(10_000).optional(),
});

export const updateHomeSpaceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  kind: z.enum(homeSpaceKinds).optional(),
  address: z.string().max(500).nullable().optional(),
  notes: z.string().max(10_000).nullable().optional(),
});

export const homeItemSchema = z.object({
  id: z.string().uuid(),
  spaceId: z.string().uuid(),
  kind: z.enum(homeItemKinds),
  name: z.string(),
  manufacturer: z.string().nullable(),
  modelNumber: z.string().nullable(),
  serialNumber: z.string().nullable(),
  colorName: z.string().nullable(),
  colorHex: z.string().nullable(),
  finish: z.string().nullable(),
  productUrl: z.string().nullable(),
  purchasedAt: isoDateTime.nullable(),
  notes: z.string().nullable(),
  createdByUserId: z.string().uuid(),
  updatedByUserId: z.string().uuid(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const createHomeItemSchema = z.object({
  spaceId: z.string().uuid(),
  kind: z.enum(homeItemKinds).optional(),
  name: z.string().min(1).max(200),
  manufacturer: z.string().max(200).optional(),
  modelNumber: z.string().max(200).optional(),
  serialNumber: z.string().max(200).optional(),
  colorName: z.string().max(200).optional(),
  colorHex: z.string().max(20).optional(),
  finish: z.string().max(200).optional(),
  productUrl: z.string().url().max(2000).optional(),
  notes: z.string().max(10_000).optional(),
});

export const updateHomeItemSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  kind: z.enum(homeItemKinds).optional(),
  manufacturer: z.string().max(200).nullable().optional(),
  modelNumber: z.string().max(200).nullable().optional(),
  serialNumber: z.string().max(200).nullable().optional(),
  colorName: z.string().max(200).nullable().optional(),
  colorHex: z.string().max(20).nullable().optional(),
  finish: z.string().max(200).nullable().optional(),
  productUrl: z.string().url().max(2000).nullable().optional(),
  notes: z.string().max(10_000).nullable().optional(),
});
