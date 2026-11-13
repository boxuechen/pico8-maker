import { useEffect, useRef, useState } from "react";
import {
  ThreadListPrimitive,
  ThreadListItemPrimitive,
  useAui,
} from "@assistant-ui/react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  MessageSquare,
  Pencil,
} from "lucide-react";
import { NameDialog } from "./NameDialog.jsx";
import { useLang } from "./i18n.js";

export function SessionSidebar({
  collapsed,
  onToggle,
  activeId,
  disabled,
  running,
  mobileOpen,
  onMobileClose,
}) {
  const runtime = useAui();
  const { t } = useLang();
  const [renaming, setRenaming] = useState(null);
  const drawer = useRef(null);
  // A native modal drawer supplies focus trapping, Escape and background inertness.
  useEffect(() => {
    if (mobileOpen) drawer.current.showModal();
    else drawer.current.close();
  }, [mobileOpen]);
  function content(compact = false) {
    return (
      <ThreadListPrimitive.Root className="session-list">
        <div className="session-sidebar-heading">
          {!compact && <span>{t("conversations")}</span>}
          <button
            aria-label={
              compact ? t("expandConversations") : t("collapseConversations")
            }
            title={
              compact ? t("expandConversations") : t("collapseConversations")
            }
            onClick={mobileOpen ? onMobileClose : onToggle}
          >
            {compact ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
          </button>
        </div>
        <ThreadListPrimitive.New
          className="new-thread"
          disabled={disabled}
          aria-label={t("newConversation")}
          title={t("newConversation")}
        >
          <Plus size={17} />
          {!compact && <span>{t("newConversation")}</span>}
        </ThreadListPrimitive.New>
        {!compact && (
          <div className="session-list-items">
            <ThreadListPrimitive.Items>
              {({ threadListItem: item }) => (
                <ThreadListItemPrimitive.Root
                  className={`session-item ${item.id === activeId ? "selected" : ""}`}
                >
                  <ThreadListItemPrimitive.Trigger
                    disabled={disabled}
                    title={item.title}
                    className="session-trigger"
                  >
                    <MessageSquare size={15} />
                    <span>
                      <ThreadListItemPrimitive.Title
                        fallback={t("newConversation")}
                      />
                    </span>
                    {running && item.id === activeId && (
                      <i className="spinner" aria-label={t("stRunning")} />
                    )}
                  </ThreadListItemPrimitive.Trigger>
                  <button
                    className="rename-thread"
                    aria-label={t("renameThread", { title: item.title })}
                    title={t("renameConversation")}
                    disabled={disabled}
                    onClick={() =>
                      setRenaming({ id: item.id, title: item.title })
                    }
                  >
                    <Pencil size={13} />
                  </button>
                </ThreadListItemPrimitive.Root>
              )}
            </ThreadListPrimitive.Items>
          </div>
        )}
        {!compact && <p className="session-sidebar-note">{t("sidebarNote")}</p>}
      </ThreadListPrimitive.Root>
    );
  }
  return (
    <>
      <aside className="session-sidebar" aria-label={t("cartConversations")}>
        {content(collapsed)}
      </aside>
      <dialog
        className="session-drawer"
        ref={drawer}
        aria-label={t("cartConversations")}
        onCancel={onMobileClose}
        onClick={(e) => {
          if (e.target === drawer.current) onMobileClose();
        }}
      >
        {mobileOpen && content()}
      </dialog>
      {renaming && (
        <NameDialog
          title={t("renameConversation")}
          label={t("conversationName")}
          initial={renaming.title}
          hint={t("conversationHint")}
          action={t("saveName")}
          onClose={() => setRenaming(null)}
          onSave={async (name) => {
            if (!name) throw new Error(t("enterConversationName"));
            await runtime.threads.item({ id: renaming.id }).rename(name);
            setRenaming(null);
          }}
        />
      )}
    </>
  );
}
