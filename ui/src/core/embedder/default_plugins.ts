// Copyright (C) 2024 The Android Open Source Project
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Restricted allowlist for the magic-trace fork. We strip Android,
// Google-internal, Chromium, kernel-vendor, and recording plugins to keep the
// surface area small and avoid loading anything that talks to external
// services. Anything not in this list is still available via the plugin
// settings page but won't run automatically.
export const defaultPlugins = [
  'dev.perfetto.CoreCommands',
  'dev.perfetto.ExampleTraces',
  'dev.perfetto.Frames',
  'dev.perfetto.GlobalGroups',
  'dev.perfetto.KernelTrackEvent',
  'dev.perfetto.LinuxPerf',
  'dev.perfetto.ProcessSummary',
  'dev.perfetto.ProcessThreadGroups',
  'dev.perfetto.Sched',
  'dev.perfetto.SearchUtils',
  'dev.perfetto.SqlModules',
  'dev.perfetto.Thread',
  'dev.perfetto.Timeline',
  'dev.perfetto.TraceInfoPage',
  'dev.perfetto.TrackEvent',
  'dev.perfetto.TrackUtils',
  'dev.perfetto.DeeplinkQuerystring',
];
