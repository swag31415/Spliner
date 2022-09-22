const disp = document.getElementById("disp")
paper.setup(disp)

const archive = {
  curr: false,
  undo_states: [],
  redo_states: [],
  save: function () {
    let state = paper.project.exportJSON()
    if (!this.curr) this.curr = state
    else if (this.curr == state) return;
    else {
      this.undo_states.push(this.curr)
      this.curr = state
      this.redo_states = []
    }
  },
  undo: function () {
    if (this.undo_states.length == 0) {
      M.toast({ html: "<span>Nothing to undo</span>" })
      return;
    }
    state = this.undo_states.pop()
    this.redo_states.push(this.curr)
    this.load(state)
  },
  redo: function () {
    if (this.redo_states.length == 0) {
      M.toast({ html: "<span>Nothing to redo</span>" })
      return;
    }
    state = this.redo_states.pop()
    this.undo_states.push(this.curr)
    this.load(state)
  },
  load: function (state) {
    paper.project.clear()
    paper.project.importJSON(state)
    this.curr = state
    paper.project.activeLayer.selected = false
  }
}

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
  spawn_slider: function (name, initial_value, on_change, init=true) {
    let [div, inp] = this.spawn_input(name, {
      type: "number",
      min: 1,
      max: 500,
      step: 1,
      value: initial_value
    })
    inp.addEventListener("change", e => on_change(e.target.value))
    // Handle initial value
    if (init) on_change(initial_value)
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

new paper.Path.Rectangle({
  point: [0, 0],
  size: paper.view.bounds,
  fillColor: "#000",
  name: 'background'
}).sendToBack()
dock.spawn_picker("background color", "#000", c => paper.project.getItem({name: 'background'}).fillColor = c.hex)

archive.save()

const main_tool = new paper.Tool({
  onActivate: function () {
    this.edit_button = dock.spawn_button("Edit", "blue-grey darken-4", e => edit_tool.start())
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
    } else if (e.modifiers.control && e.key == 'v') {
      edit_tool.start()
      edit_tool.paste()
    }
    else if (e.modifiers.control && e.key == 'z') archive.undo()
    else if (e.modifiers.control && e.key == 'y') archive.redo()
  }
})

const draw_tool = new paper.Tool({
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
    this.path = new paper.Path([point, point])
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
    if (e.key == "escape") {
      main_tool.activate()
      archive.save()
    }
    else if (e.key == "space") this.toggle_closed()
    else if (e.modifiers.control && e.key == 'z') {
      this.path.lastSegment.remove()
      if (this.path.segments.length < 2) main_tool.activate()
    }
  }
})

const edit_tool = new paper.Tool({
  hit_test: function (point, if_hit, if_no_hit) {
    let hit = paper.project.hitTest(point, {
      fill: true,
      stroke: true,
      segments: true,
      tolerance: 5,
      match: h => h.item.name != 'background'
    })
    if (hit && hit.item.name != 'background') {
      // The types are stroke, fill, and segment
      if (hit.type == "stroke" || hit.type == "fill") return if_hit(hit.item)
      else if (hit.type == "segment") return if_hit(hit.segment.point)
    } else if (if_no_hit) if_no_hit(point)
  },
  // Checks if any path is selected without any of it's points being selected
  // If so, it deselects those paths
  path_check: function () {
    paper.project.getItems({selected: true, class: paper.Path})
      .filter(path => path.segments.every(seg => !seg.point.selected))
      .forEach(path => path.selected = false)
  },
  update_selected: function () {
    this.selected_paths = paper.project.getItems({selected: true, class: paper.Path})
    if (this.selected_paths.length == 0 && this.any_selected == true) {
      this.any_selected = false;
      this.stroke_picker.remove()
      this.fill_picker.remove()
      this.thicc_slider.remove()
      this.delete_button.remove()
    } else if (this.selected_paths.length > 0 && this.any_selected == false) {
      this.any_selected = true;
      this.stroke_picker = dock.spawn_picker("stroke color", false,
        c => this.selected_paths.forEach(path => path.strokeColor = c.hex))
      this.fill_picker = dock.spawn_picker("fill color", false,
        c => this.selected_paths.forEach(path => path.fillColor = c.hex))
      this.thicc_slider = dock.spawn_slider("thickness", 1,
        n => this.selected_paths.forEach(path => path.strokeWidth = n), false)
      this.delete_button = dock.spawn_button("Delete", "black", () => {
        this.selected_paths.forEach(path => path.remove())
        this.update_selected()
        archive.save()
      })
    }
  },
  start: function () {
    M.toast({ html: "<span>Switched to <strong>Edit</strong> mode</span>" })
    this.done_button = dock.spawn_button("Done", "blue-grey darken-4", e => main_tool.activate())
    this.any_selected = false
    this.activate()
  },
  onDeactivate: function () {
    paper.project.activeLayer.selected = false
    this.update_selected()
    M.toast({ html: "<span>Leaving edit mode</span>" })
    this.done_button.remove()
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
      this.selected = paper.project
        .getItems({selected: true, class: paper.Path})
        .flatMap(path => path.segments)
        .filter(seg => seg.point.selected)
      this.hit_test(e.point, obj => this.drag_mode = "move", () => {
        if (paper.project.activeLayer.selected) {
          this.pivot = this.selected
            .map(seg => seg.point)
            .reduce((p1, p2) => p1.add(p2))
            .divide(this.selected.length)
          this.drag_mode = "rotate"
        } else {
          this.select = new paper.Path({segments: [e.point], strokeColor: "#06e", fillColor: "#06e3", closed: true})
          this.drag_mode = "select"
        }
      })
    } else {
      if (this.drag_mode == "select") this.select.add(e.point)
      else if (this.drag_mode == "move") this.selected.forEach(seg => seg.point = seg.point.add(e.delta))
      else if (this.drag_mode == "rotate") {
        let angle = e.point.subtract(this.pivot).angle - e.lastPoint.subtract(this.pivot).angle
        let trans = new paper.Matrix().rotate(angle, this.pivot)
        this.selected.forEach(seg => seg.transform(trans))
      }
    }
  },
  onMouseUp: function (e) {
    if (e.point.equals(e.downPoint)) {
      if (this.hover) this.hover = false
      else this.hit_test(e.point, obj => obj.selected = false, () => paper.project.activeLayer.selected = false)
      this.path_check()
    } else if (this.select) {
      paper.project.getItems({class: paper.Path})
        .filter(path => path != this.select && path.name != 'background')
        .flatMap(path => path.segments)
        .filter(seg => this.select.contains(seg.point))
        .forEach(seg => seg.point.selected = true)
      this.select.remove()
      this.select = false
    } else {
      archive.save()
    }
    this.update_selected()
  },
  select_all: function () {
    paper.project.getItems({class: paper.Path}).forEach(path => path.segments.forEach(seg => seg.point.selected = true))
    this.update_selected()
  },
  paste: async function () {
    paper.project.activeLayer.selected = false
    let data = await navigator.clipboard.readText()
    paper.project.importSVG(data, {
      expandShapes: true,
      onLoad: elem => {
        archive.save()
        elem.selected = true
        paper.project.getItems({selected: true, class: paper.Path}).forEach(path => path.segments.forEach(seg => seg.point.selected = true))
      },
      onError: () => M.toast({ html: "<span>Didn't recognize clipboard contents</span>" })
    })
    this.update_selected()
  },
  onKeyUp: function (e) {
    if (e.modifiers.control && e.key == 'c') {
      if (paper.project.activeLayer.selected) {
        let selected_paths = paper.project.getItems({selected: true, class: paper.Path})
        let svg_string = new paper.Group(selected_paths, {insert: false}).exportSVG({asString: true, precision: 5})
        navigator.clipboard.writeText(svg_string)
        M.toast({html: "<span>Selection Copied</span>", class: "green"})
      } else M.toast({html: "<span>Nothing Selected</span>", class: "red"})
    } else if (e.modifiers.control && e.key == 'a') this.select_all()
    else if (e.modifiers.control && e.key == 'v') this.paste()
    else if (e.key == 'e' || e.key == 'escape') main_tool.activate()
    else if (e.key == 'delete' && this.any_selected) this.delete_button.click()
    else if (e.modifiers.control && e.key == 'z') archive.undo()
    else if (e.modifiers.control && e.key == 'y') archive.redo()
  }
})

main_tool.activate()