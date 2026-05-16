# Security Specification for LG Inox App

## 1. Data Invariants
- A `TimeEntry` must belong to a valid worker ID.
- A `MaterialRequest` must have items and a valid worker ID.
- Workers can only update their own `deviceId` if it's currently null/empty.
- Only Admins can modify other worker attributes.
- Admin access is strictly controlled by a hardcoded email and an `admins` collection.

## 2. The "Dirty Dozen" Payloads (Denial Expected)
1. Creating a `worker` with a 2MB name string.
2. Updating `workers/TEST01` and changing the `id` field.
3. Creating a `timeEntry` with a negative duration or missing `date`.
4. Updating another worker's `deviceId` when already set.
5. Listing `materialRequests` without being an admin or the owner (if ownership is enforced).
6. Injecting a "Ghost Field" (e.g. `isAdmin: true`) into a `Worker` document.
7. Creating a `MaterialRequest` with an empty `items` list.
8. Deleting a `timeEntry` without being an admin.
9. Reading the `admins` collection as an unauthenticated user.
10. Using a document ID for `workers` that contains SQL injection patterns or is > 128 chars.
11. Providing a client-side timestamp for `updatedAt` instead of `request.time`.
12. Attempting to update the `createdAt` field of any document.

## 3. Conflict Report
| Collection | Identity Spoofing | State Shortcutting | Resource Poisoning |
|------------|-------------------|--------------------|--------------------|
| admins | Blocked by `isSuperAdmin` | N/A | Blocked by schema |
| workers | Blocked by `isAdmin` | Blocked by `affectedKeys` | Blocked by `isValidWorker` |
| timeEntries| Blocked by schema | N/A | Blocked by `isValidTimeEntry` |
| materialRequests | Blocked by schema | Blocked by `isTerminated` | Blocked by `isValidMaterialRequest` |
| clockEvents | Blocked by schema | N/A | Blocked by schema |
