import {
  defaultValueCtx,
  Editor,
  editorViewOptionsCtx,
  rootCtx,
} from "@milkdown/core";
import type { Ctx, MilkdownPlugin } from "@milkdown/ctx";
import { block } from "@milkdown/plugin-block";
import { clipboard } from "@milkdown/plugin-clipboard";
import { cursor } from "@milkdown/plugin-cursor";
import { diagram, diagramSchema } from "@milkdown/plugin-diagram";
import { emoji, emojiAttr } from "@milkdown/plugin-emoji";
import { history } from "@milkdown/plugin-history";
import { indent } from "@milkdown/plugin-indent";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { math, mathBlockSchema } from "@milkdown/plugin-math";
import { prism, prismConfig } from "@milkdown/plugin-prism";
import { trailing } from "@milkdown/plugin-trailing";
import { upload } from "@milkdown/plugin-upload";
import {
  codeBlockSchema,
  commonmark,
  listItemSchema,
  blockquoteSchema,
  headingAttr,
  paragraphAttr,
  headingSchema,
  wrapInHeadingInputRule,
  imageSchema,
  blockquoteAttr,
} from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { useEditor } from "@milkdown/react";
import { $view, getMarkdown } from "@milkdown/utils";
import {
  useNodeViewFactory,
  usePluginViewFactory,
  useWidgetViewFactory,
} from "@prosemirror-adapter/react";
import debounce from "lodash.debounce";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { refractor } from "refractor/lib/common";
import { useSlash } from "../slashMenu/useSlash";
import { useEmojiMenu } from "../emoji";
import { useFeatureToggle } from "../featureToggle";
import { useSetInspector } from "../inspector";
import { useSetShare } from "../share";
import { useToast } from "../toast";
import { useSetProseState } from "../proseState";

import {
  Block,
  CodeBlock,
  Diagram,
  linkPlugin,
  ListItem,
  MathBlock,
  tableTooltipCtx,
  tableTooltip,
  TableTooltip,
  tableSelectorPlugin,
  Note,
  emojiClass,
  ImageMarkdown,
} from "../../ui";
import { encode } from "shared/lib/crypto";
import { addTopics, getMarkdownPlugin } from "../../model";
import { headingAnchorPlugin } from "../anchorPlugin";
import { useUnit } from "effector-react";
import { IframeNode, remarkDirectiveIframe, inputIframeRule } from "../Iframe";
import { remarkDirectiveNote, NoteNode, inputNote } from "../note";

export const useRedactor = (onChange: (markdown: string) => void) => {
  const pluginViewFactory = usePluginViewFactory();
  const nodeViewFactory = useNodeViewFactory();
  const widgetViewFactory = useWidgetViewFactory();
  const setProseState = useSetProseState();
  const setShare = useSetShare();
  const setInspector = useSetInspector();
  const toast = useToast();
  const {
    enableGFM,
    enableMath,
    enableDiagram,
    enableBlockHandle,
    enableTwemoji,
  } = useFeatureToggle();

  const gfmPlugins: MilkdownPlugin[] = useMemo(() => {
    return [
      gfm,
      tableTooltip,
      tableTooltipCtx,
      (ctx: Ctx) => async () => {
        ctx.set(tableTooltip.key, {
          view: pluginViewFactory({
            component: TableTooltip,
          }),
        });
      },
      tableSelectorPlugin(widgetViewFactory),
    ].flat();
  }, [pluginViewFactory, widgetViewFactory]);

  const mathPlugins: MilkdownPlugin[] = useMemo(() => {
    return [
      $view(mathBlockSchema.node, () =>
        nodeViewFactory({
          component: MathBlock,
          stopEvent: () => true,
        })
      ),
      math,
    ].flat();
  }, [nodeViewFactory]);

  const diagramPlugins: MilkdownPlugin[] = useMemo(() => {
    return [
      diagram,
      $view(diagramSchema.node, () =>
        nodeViewFactory({
          component: Diagram,
          stopEvent: () => true,
        })
      ),
    ].flat();
  }, [nodeViewFactory]);

  const blockPlugins: MilkdownPlugin[] = useMemo(() => {
    return [
      block,
      (ctx: Ctx) => () => {
        ctx.set(block.key, {
          view: pluginViewFactory({
            component: Block,
          }),
        });
      },
    ].flat();
  }, [pluginViewFactory]);

  const twemojiPlugins: MilkdownPlugin[] = useMemo(() => {
    return [
      emoji,
      (ctx: Ctx) => () => {
        ctx.set(emojiAttr.key, () => ({
          container: {},
          img: {
            class: emojiClass,
          },
        }));
      },
    ].flat();
  }, []);

  const slash = useSlash();
  const emojiMenu = useEmojiMenu();
  const addTopicsUnit = useUnit(addTopics);

  const editorInfo = useEditor(
    (root) => {
      return (
        Editor.make()
          .enableInspector()
          .config((ctx) => {
            ctx.update(editorViewOptionsCtx, (prev) => ({
              ...prev,
              attributes: {
                class: "mx-auto px-2 py-4 box-border",
              },
            }));

            ctx.set(rootCtx, root);
            ctx.set(defaultValueCtx, "# hello");

            ctx.set(blockquoteAttr.key, () => ({
              class: "heelllo",
            }));

            ctx
              .get(listenerCtx)
              .markdownUpdated((_, markdown) => {
                debounce(onChange, 100)(markdown);
              })
              .updated((_, doc) => {
                const state = doc.toJSON();
                debounce(setProseState, 100)(state);
              });
            ctx.update(prismConfig.key, (prev) => ({
              ...prev,
              configureRefractor: () => refractor,
            }));
            slash.config(ctx);
            emojiMenu.config(ctx);
          })
          .use(getMarkdownPlugin)
          // .config(nord)
          .use(emojiMenu.plugins)
          .use(commonmark)
          .use(linkPlugin(widgetViewFactory))
          .use(listener)
          .use(clipboard)
          .use(history)
          .use(cursor)
          .use(prism)
          .use(indent)
          .use(upload)
          .use(trailing)
          .use(slash.plugins)
          .use(headingAnchorPlugin(widgetViewFactory, addTopicsUnit))
          .use([IframeNode, remarkDirectiveIframe, inputIframeRule])
          .use([remarkDirectiveNote, NoteNode, inputNote])
          .use($view(NoteNode, () => nodeViewFactory({ component: Note })))
          .use(
            $view(listItemSchema.node, () =>
              nodeViewFactory({ component: ListItem })
            )
          )
          .use(
            $view(imageSchema.node, () =>
              nodeViewFactory({ component: ImageMarkdown })
            )
          )
          .use(
            $view(codeBlockSchema.node, () =>
              nodeViewFactory({ component: CodeBlock })
            )
          )
        // .use(
        //   $view(blockquoteSchema.node, () =>
        //     nodeViewFactory({
        //       component: Blockquote,
        //       // update: (node) => console.log("d"),
        //     })
        //   )
        // )
      );
    },
    [onChange]
  );

  const { get, loading } = editorInfo;

  useEffect(() => {
    requestAnimationFrame(() => {
      const effect = async () => {
        const editor = get();
        if (!editor) return;

        if (enableGFM) {
          editor.use(gfmPlugins);
        } else {
          await editor.remove(gfmPlugins);
        }
        if (enableMath) {
          editor.use(mathPlugins);
        } else {
          await editor.remove(mathPlugins);
        }
        if (enableDiagram) {
          editor.use(diagramPlugins);
        } else {
          await editor.remove(diagramPlugins);
        }
        if (enableBlockHandle) {
          editor.use(blockPlugins);
        } else {
          await editor.remove(blockPlugins);
        }
        if (enableTwemoji) {
          editor.use(twemojiPlugins);
        } else {
          await editor.remove(twemojiPlugins);
        }

        await editor.create();

        setInspector(() => editor.inspect());
      };

      effect().catch((e) => {
        console.error(e);
      });
    });
  }, [
    blockPlugins,
    diagramPlugins,
    get,
    gfmPlugins,
    mathPlugins,
    twemojiPlugins,
    loading,
    enableGFM,
    enableMath,
    enableDiagram,
    enableBlockHandle,
    enableTwemoji,
    setInspector,
  ]);

  const router = useRouter();

  useEffect(() => {
    setShare(() => () => {
      const editor = get();
      if (!editor) return;

      const content = editor.action(getMarkdown());
      const base64 = encode(content);

      const url = new URL(location.href);
      url.searchParams.set("text", base64);
      navigator.clipboard.writeText(url.toString());
      toast("Share link copied.", "success");
      router.replace(url.toString());
    });
  }, [get, router, setShare, toast]);

  return editorInfo;
};
