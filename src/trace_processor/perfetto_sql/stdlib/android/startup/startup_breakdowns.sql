--
-- Copyright 2024 The Android Open Source Project
--
-- Licensed under the Apache License, Version 2.0 (the "License");
-- you may not use this file except in compliance with the License.
-- You may obtain a copy of the License at
--
--     https://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, software
-- distributed under the License is distributed on an "AS IS" BASIS,
-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-- See the License for the specific language governing permissions and
-- limitations under the License.

INCLUDE PERFETTO MODULE android.startup.startups;
INCLUDE PERFETTO MODULE intervals.overlap;
INCLUDE PERFETTO MODULE slices.hierarchy;
INCLUDE PERFETTO MODULE slices.with_context;

-- Maps slice names with common prefixes to a static string key.
-- Returns NULL if there's no mapping.
CREATE PERFETTO FUNCTION _normalize_android_string(name STRING)
RETURNS STRING
AS
SELECT
  CASE
    WHEN $name = 'mm_vmscan_direct_reclaim' THEN 'kernel_memory_reclaim'
    WHEN $name GLOB 'GC: Wait For*' THEN 'userspace_memory_reclaim'
    WHEN ($name GLOB 'monitor contention*' OR $name GLOB 'Lock contention on a monitor lock*')
      THEN 'monitor_contention'
    WHEN $name GLOB 'Lock contention*' THEN 'art_lock_contention'
    WHEN ($name = 'binder transaction' OR $name = 'binder reply') THEN 'binder'
    WHEN $name = 'Contending for pthread mutex' THEN 'mutex_contention'
    WHEN $name GLOB 'dlopen*' THEN 'dlopen'
    WHEN $name GLOB 'VerifyClass*' THEN 'verify_class'
    WHEN $name = 'inflate' THEN 'inflate'
    WHEN $name GLOB 'Choreographer#doFrame*' THEN 'choreographer_do_frame'
    WHEN $name GLOB 'OpenDexFilesFromOat*' THEN 'open_dex_files_from_oat'
    WHEN $name = 'ResourcesManager#getResources' THEN 'resources_manager_get_resources'
    WHEN $name = 'bindApplication' THEN 'bind_application'
    WHEN $name = 'activityStart' THEN 'activity_start'
    WHEN $name = 'activityResume' THEN 'activity_resume'
    WHEN $name = 'activityRestart' THEN 'activity_restart'
    WHEN $name = 'clientTransactionExecuted' THEN 'client_transaction_executed'
    ELSE NULL
    END name;

-- Derives a startup reason from a slice name and some thread_state columns.
CREATE PERFETTO FUNCTION _startup_breakdown_reason(
  name STRING,
  state STRING,
  io_wait INT,
  irq_context INT)
RETURNS STRING
AS
SELECT
  CASE
    WHEN $io_wait = 1 THEN 'io'
    WHEN $name IS NOT NULL THEN $name
    WHEN $irq_contex = 1 THEN 'irq'
    ELSE $state
    END name;

-- List of startups with unique ids for each possible upid. The existing
-- startup_ids are not necessarily unique (because of multiuser).
CREATE PERFETTO TABLE _startup_root_slices
AS
SELECT
  (SELECT MAX(id) FROM slice) + row_number() OVER () AS id,
  android_startups.dur AS dur,
  android_startups.ts AS ts,
  android_startups.startup_id,
  android_startups.startup_type,
  process.name AS process_name,
  thread.utid AS utid
FROM android_startup_processes startup
JOIN android_startups
  USING (startup_id)
JOIN thread
  ON thread.upid = process.upid AND thread.is_main_thread
JOIN process
  ON process.upid = startup.upid
WHERE android_startups.dur > 0
ORDER BY ts;

-- All slices normalized with _normalize_android_string.
CREATE PERFETTO TABLE _startup_normalized_slices
AS
SELECT p.id, p.parent_id, p.depth, p.name, thread_slice.ts, thread_slice.dur, thread_slice.utid
FROM
  _slice_remove_nulls_and_reparent
    !((SELECT id, parent_id, depth, _normalize_android_string(name) AS name FROM slice WHERE dur > 0), name)
      p
JOIN thread_slice
  USING (id);

-- Subset of _startup_normalized_slices that occurred during any app startups on the main thread.
-- Their timestamps and durations are chopped to fit within the respective app startup duration.
CREATE PERFETTO TABLE _startup_slices_breakdown
AS
SELECT *
FROM _intervals_merge_root_and_children_by_intersection !(_startup_root_slices, _startup_normalized_slices, utid);

-- Flattened slice version of _startup_slices_breakdown. This selects the leaf slice at every region
-- of the slice stack.
CREATE PERFETTO TABLE _startup_flat_slices_breakdown
AS
SELECT i.ts, i.dur, i.root_id, s.id AS slice_id, s.name FROM _intervals_flatten !(_startup_slices_breakdown) i
JOIN _startup_normalized_slices s USING (id);

-- Subset of thread_states that occurred during any app startups on the main thread.
CREATE PERFETTO TABLE _startup_thread_states_breakdown
AS
SELECT i.ts, i.dur, i.root_id, t.id AS thread_state_id, t.state, t.io_wait, t.irq_context
  FROM _intervals_merge_root_and_children_by_intersection!(_startup_root_slices,
                                                           (SELECT *, NULL AS parent_id FROM thread_state),
                                                           utid) i
JOIN thread_state t USING(id);

-- Intersection of _startup_flat_slices_breakdown and _startup_thread_states_breakdown.
-- A left intersection is used since some parts of the slice stack may not have any slices
-- but will have thread states.
CREATE VIRTUAL TABLE _startup_thread_states_and_slices_breakdown_sp
USING
  SPAN_LEFT_JOIN(
    _startup_thread_states_breakdown PARTITIONED root_id,
    _startup_flat_slices_breakdown PARTITIONED root_id);

-- Blended thread state and slice breakdown blocking app startups.
--
-- Each row blames a unique period during an app startup with a reason
-- derived from the slices and thread states on the main thread.
--
-- Some helpful events to enables are binder transactions, ART, am and view.
CREATE PERFETTO TABLE android_startup_opinionated_breakdown(
  -- Startup id. Alias of `slice.id`
  startup_id INT,
  -- Id of relevant slice blocking startup. Alias of `slice.id`.
  slice_id INT,
  -- Id of thread_state blocking startup. Alias of `thread_state.id`.
  thread_state_id INT,
  -- Timestamp of an exclusive interval during the app startup with a single latency reason.
  ts INT,
  -- Duration of an exclusive interval during the app startup with a single latency reason.
  dur INT,
  -- Cause of delay during an exclusive interval of the app startup.
  reason STRING
)
AS
SELECT b.ts, b.dur, startup.startup_id, b.slice_id, b.thread_state_id, _startup_breakdown_reason(name, state, io_wait, irq_context) AS reason
FROM _startup_thread_states_and_slices_breakdown_sp b
JOIN _startup_root_slices startup ON startup.id = b.root_id;