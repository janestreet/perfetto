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

import {AppImpl} from '../../core/app_impl';
import {Router} from '../../core/router';
import {globals} from '../../frontend/globals';
import {App} from '../../public/app';
import {PerfettoPlugin, PluginDescriptor} from '../../public/plugin';

function openTraceUrl(app: App, url: string): void {
  app.analytics.logEvent('Trace Actions', 'Open example trace');
  AppImpl.instance.openTraceFromUrl(url);
  Router.navigate('#!/viewer');
}

class ExampleTracesPlugin implements PerfettoPlugin {
  onActivate(ctx: App) {
    const OPEN_C_DEMO_TRACE_COMMAND_ID =
      'perfetto.CoreCommands#openCDemoTrace';
    ctx.commands.registerCommand({
      id: OPEN_C_DEMO_TRACE_COMMAND_ID,
      name: 'C - Demo',
      callback: () => {
        openTraceUrl(ctx, globals.root + "assets/c-demo.fxt.gz");
      },
    });
    ctx.sidebar.addMenuItem({
      commandId: OPEN_C_DEMO_TRACE_COMMAND_ID,
      group: 'example_traces',
      icon: 'description',
    });

    const OPEN_OCAML_HELLO_WORLD_TRACE_COMMAND_ID =
      'perfetto.CoreCommands#openOCamlHelloWorldTrace';
    ctx.commands.registerCommand({
      id: OPEN_OCAML_HELLO_WORLD_TRACE_COMMAND_ID,
      name: 'OCaml - Hello World',
      callback: () => {
        openTraceUrl(ctx, globals.root + "assets/ocaml-hello-world.fxt.gz");
      },
    });
    ctx.sidebar.addMenuItem({
      commandId: OPEN_OCAML_HELLO_WORLD_TRACE_COMMAND_ID,
      group: 'example_traces',
      icon: 'description',
    });

    const OPEN_C_HELLO_WORLD_TRACE_COMMAND_ID =
      'perfetto.CoreCommands#openCHelloWorldTrace';
    ctx.commands.registerCommand({
      id: OPEN_C_HELLO_WORLD_TRACE_COMMAND_ID,
      name: 'C - Hello World',
      callback: () => {
        openTraceUrl(ctx, globals.root + "assets/c-hello-world.fxt.gz");
      },
    });
    ctx.sidebar.addMenuItem({
      commandId: OPEN_C_HELLO_WORLD_TRACE_COMMAND_ID,
      group: 'example_traces',
      icon: 'description',
    });
  }
}

export const plugin: PluginDescriptor = {
  pluginId: 'perfetto.ExampleTraces',
  plugin: ExampleTracesPlugin,
};
