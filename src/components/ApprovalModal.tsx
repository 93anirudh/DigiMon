interface Props {
  toolName: string
  toolArgs: Record<string, any>
  onApprove: () => void
  onReject: () => void
}

export function ApprovalModal({ toolName, toolArgs, onApprove, onReject }: Props) {
  return (
    <div className="overlay">
      <div className="modal">
        <div className="modal-hdr">
          <div className="modal-icon-wrap warn">⚠</div>
          <div>
            <div className="modal-title">Action Requires Approval</div>
            <div className="modal-sub">
              The AI is requesting permission to run a system action on your machine
            </div>
          </div>
        </div>

        <div className="modal-tool-block">
          <div className="modal-micro">Tool</div>
          <div className="modal-tool-name">{toolName}</div>
          <div className="modal-micro">Arguments</div>
          <div className="modal-args">
            {JSON.stringify(toolArgs, null, 2)}
          </div>
        </div>

        <div className="modal-btns">
          <button className="btn-primary" onClick={onApprove}>
            ✓ Approve & Run
          </button>
          <button className="btn-ghost" onClick={onReject}>
            ✕ Reject
          </button>
        </div>
      </div>
    </div>
  )
}
