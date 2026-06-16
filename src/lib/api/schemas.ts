import { z } from "zod";
import { restaurantStatuses } from "@/db/schema/restaurants";
import { PROJECT_STATUSES } from "@/db/schema/projects";

const isoDateTime = z.string().datetime();

export const streamEntrySchema = z.object({
  id: z.string().uuid(),
  body: z.string(),
  isPinned: z.boolean(),
  doneAt: isoDateTime.nullable(),
  roughWhen: z.string().nullable(),
  createdByUserId: z.string().uuid(),
  updatedByUserId: z.string().uuid(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const createStreamEntrySchema = z.object({
  body: z.string().min(1).max(10_000),
  roughWhen: z.string().max(200).optional(),
  isPinned: z.boolean().optional(),
});

export const updateStreamEntrySchema = z.object({
  body: z.string().min(1).max(10_000).optional(),
  roughWhen: z.string().max(200).nullable().optional(),
  isPinned: z.boolean().optional(),
  done: z.boolean().optional(),
});

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
  description: z.string().nullable(),
  status: z.enum(PROJECT_STATUSES),
  createdByUserId: z.string().uuid(),
  updatedByUserId: z.string().uuid(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const createProjectSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
});

export const updateProjectSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
});

export const metricSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  unit: z.string().nullable(),
  createdByUserId: z.string().uuid(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const createMetricSchema = z.object({
  name: z.string().min(1).max(200),
  unit: z.string().max(50).optional(),
});

export const updateMetricSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  unit: z.string().max(50).nullable().optional(),
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

export const eventSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  startsAt: isoDateTime,
  location: z.string().nullable(),
  link: z.string().nullable(),
  note: z.string().nullable(),
  createdByUserId: z.string().uuid(),
  updatedByUserId: z.string().uuid(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

export const createEventSchema = z.object({
  title: z.string().min(1).max(200),
  startsAt: isoDateTime,
  location: z.string().max(500).optional(),
  link: z.string().url().optional(),
  note: z.string().max(5000).optional(),
});

export const updateEventSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  startsAt: isoDateTime.optional(),
  location: z.string().max(500).nullable().optional(),
  link: z.string().url().nullable().optional(),
  note: z.string().max(5000).nullable().optional(),
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
