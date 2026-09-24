/*
  Resizable information box. This is the left hand side if the screen that moves and will contain
  both the telemetry information and actions, which are both separate components. These
  components are passed in via the props.children which in this case is from dashboard.jsx
*/

// 3rd Party Imports
import { ResizableBox } from "react-resizable"

// Helpers
import GetOutsideVisibilityColor from "../../helpers/outsideVisibility"

export default function ResizableInfoBox(props) {
  return (
    <div
      className="absolute top-0 left-0 h-full z-10"
      style={{ backgroundColor: GetOutsideVisibilityColor() }}
    >
      <ResizableBox
        height={props.telemetryPanelSize.height}
        width={props.telemetryPanelSize.width}
        minConstraints={[275, Infinity]}
        maxConstraints={[props.viewportWidth - 200, Infinity]}
        resizeHandles={["e"]}
        handle={(_, ref) => <span className={"custom-handle-e"} ref={ref} />}
        handleSize={[32, 32]}
        axis="x"
        onResize={(_, { size }) => {
          props.setTelemetryPanelSize({
            width: size.width,
            height: size.height,
          })
          props.setTelemetryFontSize(props.calcBigTextFontSize())
        }}
        className="h-full"
      >
        <div
          data-telemetry-panel
          className="@container flex flex-col px-6 py-2 h-full gap-2 overflow-x-hidden overflow-y-auto pr-8"
        >
          {props.children}
        </div>
      </ResizableBox>
    </div>
  )
}
