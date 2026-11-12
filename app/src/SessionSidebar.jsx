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
          {!compact && <span>CONVERSATIONS</span>}
          <button
            aria-label={
              compact ? "Expand conversations" : "Collapse conversations"
            }
            title={compact ? "Expand conversations" : "Collapse conversations"}
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
          aria-label="New conversation"
          title="New conversation"
        >
          <Plus size={17} />
          {!compact && <span>New conversation</span>}
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
                      <ThreadListItemPrimitive.Title fallback="New conversation" />
                    </span>
                    {running && item.id === activeId && (
                      <i className="spinner" aria-label="Running" />
                    )}
                  </ThreadListItemPrimitive.Trigger>
                  <button
                    className="rename-thread"
                    aria-label={`Rename ${item.title}`}
                    title="Rename conversation"
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
        {!compact && (
          <p className="session-sidebar-note">
            Separate conversations.
            <br />
            One shared cart.
          </p>
        )}
      </ThreadListPrimitive.Root>
    );
  }
  return (
    <>
      <aside className="session-sidebar" aria-label="Cart conversations">
        {content(collapsed)}
      </aside>
      <dialog
        className="session-drawer"
        ref={drawer}
        aria-label="Cart conversations"
        onCancel={onMobileClose}
        onClick={(e) => {
          if (e.target === drawer.current) onMobileClose();
        }}
      >
        {mobileOpen && content()}
      </dialog>
      {renaming && (
        <NameDialog
          title="Rename conversation"
          label="Conversation name"
          initial={renaming.title}
          hint="Keep it short and easy to find."
          action="Save name"
          onClose={() => setRenaming(null)}
          onSave={async (name) => {
            if (!name) throw new Error("Enter a conversation name.");
            await runtime.threads.item({ id: renaming.id }).rename(name);
            setRenaming(null);
          }}
        />
      )}
    </>
  );
}
