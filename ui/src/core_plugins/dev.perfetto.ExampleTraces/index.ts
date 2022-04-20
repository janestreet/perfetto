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

import {assetSrc} from '../../base/assets';
import {AppImpl} from '../../core/app_impl';
import type {App} from '../../public/app';
import type {PerfettoPlugin} from '../../public/plugin';

function openTraceUrl(app: App, url: string): void {
  app.analytics.logEvent('Trace Actions', 'Open example trace');
  AppImpl.instance.openTraceFromUrl(url);
}

export default class implements PerfettoPlugin {
  static readonly id = 'dev.perfetto.ExampleTraces';
  static onActivate(ctx: App) {
    const OPEN_C_DEMO_TRACE_COMMAND_ID = 'dev.perfetto.OpenCDemoTrace';
    ctx.commands.registerCommand({
      id: OPEN_C_DEMO_TRACE_COMMAND_ID,
      name: 'C - Demo',
      callback: () => {
        openTraceUrl(ctx, assetSrc('assets/c-demo.fxt.gz'));
      },
    });
    ctx.sidebar.addMenuItem({
      section: 'trace_files',
      commandId: OPEN_C_DEMO_TRACE_COMMAND_ID,
      icon: 'description',
      sortOrder: 3,
    });

    const OPEN_OCAML_HELLO_WORLD_TRACE_COMMAND_ID =
      'dev.perfetto.OpenOCamlHelloWorldTrace';
    ctx.commands.registerCommand({
      id: OPEN_OCAML_HELLO_WORLD_TRACE_COMMAND_ID,
      name: 'OCaml - Hello World',
      callback: () => {
        openTraceUrl(ctx, assetSrc('assets/ocaml-hello-world.fxt.gz'));
      },
    });
    ctx.sidebar.addMenuItem({
      section: 'trace_files',
      commandId: OPEN_OCAML_HELLO_WORLD_TRACE_COMMAND_ID,
      icon: 'description',
      sortOrder: 4,
    });

    const OPEN_C_HELLO_WORLD_TRACE_COMMAND_ID =
      'dev.perfetto.OpenCHelloWorldTrace';
    ctx.commands.registerCommand({
      id: OPEN_C_HELLO_WORLD_TRACE_COMMAND_ID,
      name: 'C - Hello World',
      callback: () => {
        openTraceUrl(ctx, assetSrc('assets/c-hello-world.fxt.gz'));
      },
    });
    ctx.sidebar.addMenuItem({
      section: 'trace_files',
      commandId: OPEN_C_HELLO_WORLD_TRACE_COMMAND_ID,
      icon: 'description',
      sortOrder: 5,
    });
  }
}
