/**
 * BoundlessDB Consistency Configuration
 * 
 * Define which keys should be extracted from each event type.
 * These keys are used for:
 * - Querying events (read with conditions)
 * - Consistency checking (conflict detection on append)
 * 
 * Edit this file to match your domain events!
 */

import type { ConsistencyConfig } from "./types.ts";

export const consistencyConfig: ConsistencyConfig = {
  eventTypes: {
    // ================================================
    // Example: Course enrollment system
    // ================================================
    CourseCreated: {
      keys: [
        { name: "course", path: "data.courseId" }
      ]
    },
    
    StudentSubscribed: {
      keys: [
        { name: "course", path: "data.courseId" },
        { name: "student", path: "data.studentId" }
      ]
    },
    
    StudentUnsubscribed: {
      keys: [
        { name: "course", path: "data.courseId" },
        { name: "student", path: "data.studentId" }
      ]
    },
    
    CourseCancelled: {
      keys: [
        { name: "course", path: "data.courseId" }
      ]
    },

    // ================================================
    // Add your own event types below!
    // ================================================
    
    // Example: E-commerce
    // OrderPlaced: {
    //   keys: [
    //     { name: "order", path: "data.orderId" },
    //     { name: "customer", path: "data.customerId" },
    //     { name: "month", path: "data.placedAt", transform: "MONTH" }
    //   ]
    // },
    
    // Example: With transforms
    // UserRegistered: {
    //   keys: [
    //     { name: "email", path: "data.email", transform: "LOWER" },
    //     { name: "username", path: "data.username", transform: "LOWER" }
    //   ]
    // }
  }
};

/**
 * Get key extraction config for an event type
 */
export function getEventConfig(eventType: string) {
  return consistencyConfig.eventTypes[eventType];
}

/**
 * Check if an event type is known
 */
export function isKnownEventType(eventType: string): boolean {
  return eventType in consistencyConfig.eventTypes;
}
