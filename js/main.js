const disp = document.getElementById("disp")
paper.install(window)
paper.setup(disp)

const dock = {
  dock: document.getElementById("dock"),
  spawn_input: function (name, attrs) {
    let inp = document.createElement("input")
    Object.assign(inp, {...attrs, id: (Math.random() + 1).toString(36).substring(7)})
    let label = document.createElement("label")
    Object.assign(label, {className: "active", for: inp.id, innerText: name})
    let div = document.createElement("div")
    div.className = "input-field"
    div.append(inp, label)
    this.dock.appendChild(div)
    return [div, inp]
  },
  spawn_picker: function (name, initial_value, on_change) {
    let [div, inp] = this.spawn_input(name, {type: "text"})
    // Attach the picker
    let picker = new Picker(div)
    inp.addEventListener("focus", () => picker.show())
    picker.onChange = col => {
      inp.style["border-color"] = col.rgbaString
      inp.value = col.hex
      // Push the event along
      if (on_change) on_change(col)
    }
    // Handle initial value
    if (initial_value) picker.setColor(initial_value, false)
    // Add a better remove function
    picker.remove = function () {
      div.remove()
      this.destroy()
    }
    return picker
  },
  spawn_slider: function (name, initial_value, on_change) {
    let [div, inp] = this.spawn_input(name, {
      type: "number",
      min: 1,
      max: 500,
      step: 1,
      value: initial_value
    })
    inp.addEventListener("change", e => on_change(e.target.value))
    // Handle initial value
    on_change(initial_value)
    return div
  },
  spawn_button: function(name, classes, on_click) {
    let butt = document.createElement("button")
    butt.innerText = name
    butt.className = "btn input-field " + classes
    butt.addEventListener("click", on_click)
    this.dock.appendChild(butt)
    return butt
  }
}

const background = new Path.Rectangle({
  point: [0, 0],
  size: view.bounds,
  fillColor: "#000"
})
background.sendToBack()
dock.spawn_picker("background color", "#000", c => background.fillColor = c.hex)

const main_tool = new Tool({
  onActivate: function () {
    this.edit_button = dock.spawn_button("Edit Mode", "blue-grey darken-4", e => edit_tool.start())
  },
  onDeactivate: function () {
    this.edit_button.remove()
  },
  onMouseDown: e => draw_tool.start(e.point),
  onKeyUp: e => {
    if (e.key == 'e') edit_tool.start()
    else if (e.modifiers.control && e.key == 'a') {
      edit_tool.start()
      edit_tool.select_all()
    }
  }
})

const draw_tool = new Tool({
  default: {
    strokeColor: "#fff",
    fillColor: "#fff0",
    strokeWidth: 1,
  },
  toggle_closed: function () {
    this.path.closed = !this.path.closed
    if (this.close_toggle) this.close_toggle.innerText = this.path.closed ? "open" : "close"
  },
  start: function (point) {
    this.path = new Path([point, point])
    this.stroke_picker = dock.spawn_picker("stroke color", this.default.strokeColor,
      c => draw_tool.default.strokeColor = draw_tool.path.strokeColor = c.hex)
    this.fill_picker = dock.spawn_picker("fill color", this.default.fillColor,
      c => draw_tool.default.fillColor = draw_tool.path.fillColor = c.hex)
    this.thicc_slider = dock.spawn_slider("thickness", this.default.strokeWidth,
      n => draw_tool.default.strokeWidth = draw_tool.path.strokeWidth = n)
    this.close_toggle = dock.spawn_button("close", "blue-grey darken-4", e => this.toggle_closed())
    this.activate()
  },
  onDeactivate: function () {
    this.path.lastSegment.remove()
    this.stroke_picker.remove()
    this.fill_picker.remove()
    this.thicc_slider.remove()
    this.close_toggle.remove()
  },
  onMouseDown: function (e) {
    this.path.add(e.point)
  },
  onMouseMove: function (e) {
    this.path.lastSegment.point = e.point
    this.path.smooth({ type: "continuous" })
  },
  onKeyUp: function (e) {
    if (e.key == "escape") main_tool.activate()
    else if (e.key == "space") this.toggle_closed()
  }
})

const edit_tool = new Tool({
  hit_test: function (point, if_hit, if_no_hit) {
    let hit = project.hitTest(point, {
      fill: true,
      stroke: true,
      segments: true,
      tolerance: 5,
      match: h => h.item != background
    })
    if (hit && hit.item != background) {
      // The types are stroke, fill, and segment
      if (hit.type == "stroke" || hit.type == "fill") return if_hit(hit.item)
      else if (hit.type == "segment") return if_hit(hit.segment.point)
    } else if (if_no_hit) if_no_hit(point)
  },
  path_check: function () {
    project.getItems({selected: true, class: Path})
      .filter(path => path.segments.every(seg => !seg.point.selected))
      .forEach(path => path.selected = false)
  },
  start: function () {
    M.toast({ html: "<span>Switched to <strong>Edit</strong> mode</span>" })
    this.activate()
  },
  onMouseMove: function (e) {
    this.hit_test(e.point, obj => {
      if (!obj.selected) {
        this.hover = obj
        this.hover.selected = true
        if (this.hover.segments) this.hover.segments.forEach(seg => seg.point.selected = true)
      }
    }, () => {
      if (this.hover) {
        this.hover.selected = false
        this.hover = false
        this.path_check()
      }
    })
  },
  onMouseDrag: function (e) {
    if (e.count == 0) {
      this.selected = project
        .getItems({selected: true, class: Path})
        .flatMap(path => path.segments)
        .filter(seg => seg.point.selected)
      this.hit_test(e.point, obj => this.drag_mode = "move", () => {
        if (project.activeLayer.selected) {
          this.pivot = this.selected
            .map(seg => seg.point)
            .reduce((p1, p2) => p1.add(p2))
            .divide(this.selected.length)
          this.drag_mode = "rotate"
        } else {
          this.select = new Path({segments: [e.point], strokeColor: "#06e", fillColor: "#06e3", closed: true})
          this.drag_mode = "select"
        }
      })
    } else {
      if (this.drag_mode == "select") this.select.add(e.point)
      else if (this.drag_mode == "move") this.selected.forEach(seg => seg.point = seg.point.add(e.delta))
      else if (this.drag_mode == "rotate") {
        let angle = e.point.subtract(this.pivot).angle - e.lastPoint.subtract(this.pivot).angle
        let trans = new Matrix().rotate(angle, this.pivot)
        this.selected.forEach(seg => seg.transform(trans))
      }
    }
  },
  onMouseUp: function (e) {
    if (e.point.equals(e.downPoint)) {
      if (this.hover) this.hover = false
      else this.hit_test(e.point, obj => obj.selected = false, () => project.activeLayer.selected = false)
      this.path_check()
    } else if (this.select) {
      project.getItems({class: Path})
        .filter(path => path != this.select && path != background)
        .flatMap(path => path.segments)
        .filter(seg => this.select.contains(seg.point))
        .forEach(seg => seg.point.selected = true)
      this.select.remove()
      this.select = false
    }
  },
  select_all: function () {
    project.getItems({class: Path}).flatMap(path => path.segments).forEach(seg => seg.point.selected = true)
  },
  onKeyUp: function (e) {
    if (e.modifiers.control && e.key == 'c') {
      if (project.activeLayer.selected) {
        let selected_paths = project.getItems({selected: true, class: Path})
        let svg_string = new Group(selected_paths, {insert: false}).exportSVG({asString: true, precision: 5})
        navigator.clipboard.writeText(svg_string)
        M.toast({html: "<span>Selection Copied</span>", class: "green"})
      } else M.toast({html: "<span>Nothing Selected</span>", class: "red"})
    } else if (e.modifiers.control && e.key == 'a') this.select_all()
  }
})

main_tool.activate()