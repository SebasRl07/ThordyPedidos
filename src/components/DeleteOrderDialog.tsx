import { useState } from "react";
import type { Order } from "../../shared/domain";
import { Dialog } from "./Dialog";
import { Icon } from "./Icon";
import { api, ApiError } from "../api";
export function DeleteOrderDialog({
  order,
  onClose,
  onDeleted,
  onConflict,
}: {
  order: Order;
  onClose: () => void;
  onDeleted: () => void;
  onConflict: () => void;
}) {
  const [confirmation, setConfirmation] = useState(""),
    [acknowledged, setAcknowledged] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Dialog
      title={`Eliminar pedido #${order.id}`}
      onClose={onClose}
      busy={busy}
    >
      <div className="deletion-warning">
        <Icon name="trash" size={24} />
        <div>
          <strong>Esta acción es irreversible.</strong>
          <p>
            Se eliminarán el pedido, sus productos, el historial de estados y
            los trabajos de impresión asociados. También dejará de contar en
            ventas e informes. Se conservará una auditoría mínima de la
            eliminación.
          </p>
        </div>
      </div>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || confirmation !== String(order.id) || !acknowledged)
            return;
          setBusy(true);
          setError("");
          try {
            await api(`orders/${order.id}`, "DELETE", {
              confirmation,
              acknowledged,
              expected_revision: order.revision,
            });
            onDeleted();
          } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo eliminar");
            if (e instanceof ApiError && (e.status === 404 || e.status === 409))
              onConflict();
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Escribe {order.id} para confirmar
          <input
            aria-label="Número del pedido a eliminar"
            inputMode="numeric"
            autoComplete="off"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            disabled={busy}
          />
        </label>
        <label className="check acknowledgement">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            disabled={busy}
          />
          Confirmo que deseo eliminar definitivamente este pedido.
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            type="button"
            className="ghost"
            onClick={onClose}
            disabled={busy}
          >
            Conservar pedido
          </button>
          <button
            type="submit"
            className="danger"
            disabled={
              busy || confirmation !== String(order.id) || !acknowledged
            }
          >
            {busy ? "Eliminando…" : "Eliminar definitivamente"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
