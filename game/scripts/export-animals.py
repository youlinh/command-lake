"""Generate the original rigged Command Lake animals with Blender 4.x."""

import argparse
import json
from math import cos, pi, sin, sqrt
from pathlib import Path
from struct import pack
import sys

import bpy
from mathutils import Matrix, Vector


# Work in game coordinates (X right, Y up, Z forward). Blender is Z up.
def blender_point(point):
    return (point[0], -point[2], point[1])


def rgb(hexadecimal):
    channels = (int(hexadecimal[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return tuple(value / 12.92 if value < .04045 else ((value + .055) / 1.055) ** 2.4 for value in channels)


def blend(a, b, amount):
    return tuple(x + (y - x) * amount for x, y in zip(a, b))


def smooth(start, end, value):
    t = max(0, min(1, (value - start) / (end - start)))
    return t * t * (3 - 2 * t)


def sample(a, b, t):
    return Vector(a).lerp(Vector(b), t)


class Surface:
    def __init__(self):
        self.points = []
        self.faces = []
        self.colors = []
        self.weights = []
        self.joints = {}

    def joint(self, label, start, end=None):
        self.joints[label] = (Vector(start), Vector(end) if end is not None else Vector(start) + Vector((0, .2, 0)))

    def loft(self, rings, shade, weights, sides=14):
        """Join elliptical rings in path order. The first radius runs across X."""
        start = len(self.points)
        centers = [Vector(ring[0]) for ring in rings]
        for row, (_, width, depth) in enumerate(rings):
            forward = (centers[min(row + 1, len(rings) - 1)] - centers[max(0, row - 1)]).normalized()
            right = Vector((1, 0, 0))
            if abs(right.dot(forward)) > .92:
                right = Vector((0, 0, 1))
            right = (right - forward * right.dot(forward)).normalized()
            up = forward.cross(right)
            for j in range(sides):
                angle = j * 2 * pi / sides
                point = centers[row] + width * cos(angle) * right + depth * sin(angle) * up
                self.points.append(point)
                self.colors.append(shade(point, angle, row / (len(rings) - 1)))
                self.weights.append(weights(row) if callable(weights) else weights)
        self.faces.append(tuple(start + j for j in reversed(range(sides))))
        for row in range(len(rings) - 1):
            lower = start + row * sides
            upper = lower + sides
            for j in range(sides):
                other = (j + 1) % sides
                self.faces.append((lower + j, lower + other, upper + other, upper + j))
        end = len(self.points) - sides
        self.faces.append(tuple(end + j for j in range(sides)))

    def oval(self, center, radii, shade, bone, sides=14, rings=8, yaw=0):
        part = Surface()
        profiles = []
        for index in range(rings + 1):
            angle = pi * (.02 + .96 * index / rings)
            profiles.append(((0, 0, -cos(angle) * radii[2]), sin(angle) * radii[0], sin(angle) * radii[1]))
        part.loft(profiles, shade, {bone: 1}, sides)
        start = len(self.points)
        c, s = cos(yaw), sin(yaw)
        for x, y, z in part.points:
            self.points.append((center[0] + x * c + z * s, center[1] + y, center[2] + z * c - x * s))
        self.faces.extend(tuple(index + start for index in face) for face in part.faces)
        self.colors.extend(part.colors)
        self.weights.extend(part.weights)


def solid(color):
    return lambda *_: color


# Width, standing torso height, half body length, depth, head radius, snout length.
ANATOMY = {
    "cat": (.343, .829, .785, .281, .282, .105),
    "fox": (.31, .901, .822, .273, .233, .297),
    "hare": (.30, .593, .505, .293, .202, .084),
    "otter": (.312, .535, .823, .278, .240, .129),
    "badger": (.432, .594, .765, .311, .252, .209),
    "wolf": (.412, 1.070, .891, .324, .267, .306),
    "boar": (.493, .808, .883, .363, .287, .282),
    "bear": (.545, 1.006, .944, .391, .326, .184),
    "stag": (.324, 1.354, .888, .303, .209, .221),
}

# Coat, back, belly, paw or hoof, iris. Keys mirror the animal catalog.
ANIMALS = {
    "cat": ("cat", "db843e", "913e22", "f2d7aa", "f1d8b7", "88a95c"),
    "fox": ("fox", "c96836", "8a351f", "eadabe", "392d32", "b9a05b"),
    "hare": ("hare", "d3cdbf", "979386", "f4ebd6", "e8e0cd", "594131"),
    "otter": ("otter", "8c6349", "553b32", "d2ad85", "614539", "5e412b"),
    "badger": ("badger", "84827d", "4e5153", "d4c5ac", "45454a", "7a5a39"),
    "lynx": ("cat", "bc975d", "746044", "e9cfaa", "d2b087", "b1a25c"),
    "wolf": ("wolf", "8d928e", "4d5a5d", "c9c0ab", "66645d", "cdae64"),
    "boar": ("boar", "69564b", "372f30", "a08b6f", "403537", "8d653d"),
    "bear": ("bear", "835f47", "4b3832", "ad8767", "624b3f", "825f43"),
    "stag": ("stag", "aa7650", "644632", "e0bea0", "493d35", "87643e"),
    "tiger": ("cat", "e69b49", "793b29", "f1ddbc", "e8cda8", "bea25d"),
    "frost": ("wolf", "c2d0d2", "758e9b", "eff4ef", "acbcc3", "95e0e7"),
    "ember": ("bear", "886658", "422f33", "b58b76", "6b514e", "deaa69"),
    "storm": ("stag", "8f9a8a", "526c63", "dae2c8", "4d5654", "9dd6b1"),
}


def body_coat(point, angle, progress, key, palette):
    base, back, belly, *_ = palette
    tone = blend(base, back, smooth(.25, .97, sin(angle)) * .64)
    tone = blend(tone, belly, smooth(.42, .98, -sin(angle)) * .76)
    if key in ("cat", "tiger"):
        stripe = sin(8.6 * pi * progress + 2.0 * abs(cos(angle)) ** 1.5 + .5 * sin(3 * angle))
        contrast = .71 if key == "tiger" else .53
        tone = blend(tone, back, smooth(.21, .83, stripe) * smooth(-.66, .54, sin(angle)) * contrast)
    if key == "lynx":
        fleck = sin(progress * 52 + .9 * sin(angle * 5)) * cos(angle * 8 + progress * 13)
        tone = blend(tone, back, smooth(.51, .87, fleck) * .44)
    return tone


def build_torso(mesh, key, kind, dimensions, palette):
    w, h, length, depth, _, _ = dimensions
    profile = [
        (-1.03, .06, .12, .20), (-.94, .43, .34, .12), (-.80, .76, .84, .01),
        (-.60, .95, 1, 0), (-.38, .96, 1.03, -.035), (-.12, .84, .87, -.05),
        (.09, .86, .90, -.035), (.31, .96, 1.03, .025), (.51, 1.00, 1.10, .065),
        (.67, .88, .98, .11), (.79, .62, .76, .15), (.92, .29, .47, .18), (.98, .06, .12, .20),
    ]
    rings = []
    for z, width, height, lift in profile:
        rump = 1.14 if kind == "hare" and z < 0 else 1
        shoulder = 1.09 if kind in ("bear", "boar") and z > .17 else 1
        rings.append(((0, h + lift * depth, z * length), w * width * rump * shoulder, depth * height * shoulder))
    mesh.loft(rings, lambda point, angle, progress: body_coat(point, angle, progress, key, palette), {"Body": 1}, 26)


def build_head(mesh, key, kind, dimensions, palette):
    w, h, length, depth, head_width, snout = dimensions
    base, back, belly, _, iris = palette
    deer, hare = kind == "stag", kind == "hare"
    canid = kind in ("fox", "wolf")
    neck_rise = .675 if deer else .30 if canid else .29 if hare else .245 if kind == "cat" else .19
    center = Vector((0, h + neck_rise, length * (.81 if deer else .87)))
    mesh.joint("Head", center)
    neck_start = Vector((0, h + depth * .06, length * .43))
    neck_end = center + Vector((0, -.035, .06))
    neck_path = [(neck_start, w * .72, depth * .83), (sample(neck_start, neck_end, .41), w * .81, depth * .78),
                 (sample(neck_start, neck_end, .70), head_width * .81, depth * .57), (neck_end, head_width * .49, depth * .4)]
    mesh.loft(neck_path, lambda _, angle, __: blend(base, belly, smooth(.34, 1, -sin(angle)) * .58),
              lambda index: {"Body": 1} if index < 2 else {"Body": .7, "Head": .3}, 18)

    crown_height = .272 if kind in ("bear", "boar") else .232 if kind == "cat" else .209
    head_length = .314 if canid else .269
    mesh.oval(center, (head_width, crown_height, head_length),
              lambda _, angle, t: blend(blend(base, back, max(0, sin(angle)) * .5),
                                         belly, smooth(.36, .85, -sin(angle)) * (.64 if t > .4 else .38)), "Head", 23, 12)

    nose_z = center.z + head_length * .77 + snout
    nose_y = center.y - (.115 if deer or kind == "boar" else .069)
    muzzle_width = head_width * (.50 if hare else .68 if kind == "cat" else .74 if kind in ("bear", "boar") else .59)
    muzzle = [
        ((0, center.y - .075, center.z + head_length * .33), muzzle_width * .65, .091),
        ((0, nose_y - .040, center.z + head_length * .69), muzzle_width, .096),
        ((0, nose_y - .032, nose_z - .052), muzzle_width * (.70 if canid else .88), .074),
        ((0, nose_y - .018, nose_z + .005), muzzle_width * .52, .043),
    ]
    upper = base if canid or kind == "boar" else blend(base, belly, .6)
    mesh.loft(muzzle, lambda _, angle, __: blend(upper, belly, smooth(.05, .94, -sin(angle)) * .85), {"Head": 1}, 16)
    nose_color = rgb("674238") if kind == "cat" else rgb("302a2a")
    mesh.oval((0, nose_y + .003, nose_z + .012),
              (muzzle_width * (.71 if kind == "boar" else .48), .039 if kind == "boar" else .028, .026),
              solid(nose_color), "Head", 12, 6)
    jaw = blend(belly, back, .13)
    mesh.oval((0, nose_y - .104, nose_z - snout * .32 - .053),
              (muzzle_width * .80, .032, .086 + snout * .32), solid(jaw), "Head", 12, 6)

    for side in (-1, 1):
        angle = side * (.59 if kind == "cat" else .82 if canid else .94)
        eye_x = side * head_width * (.79 if kind != "boar" else .83)
        eye_z = center.z + head_length * (.55 if kind != "boar" else .46)
        eye_y = center.y + .031
        eye_size = .039 if kind in ("bear", "boar", "otter", "badger") else .048
        mesh.oval((eye_x, eye_y, eye_z), (eye_size * 1.30, eye_size * .97, .028), solid(rgb("3c302c")), "Head", 12, 6, angle)
        globe = (eye_x + side * .013, eye_y, eye_z + .019)
        mesh.oval(globe, (eye_size, eye_size * .76, .023), solid(iris), "Head", 12, 6, angle)
        mesh.oval((globe[0] + side * .012, eye_y, globe[2] + .015),
                  (.012 if kind == "cat" else .022, eye_size * .65, .013), solid(rgb("211c1b")), "Head", 10, 6, angle)
        mesh.oval((globe[0] + side * .008, eye_y + .014, globe[2] + .027),
                  (.009, .008, .005), solid(rgb("fff2df")), "Head", 8, 4, angle)

        build_ear(mesh, key, kind, center, head_width, crown_height, side, palette)
        if kind in ("cat", "otter"):
            for index in range(3):
                y = nose_y - .040 - .019 * index
                start = (side * muzzle_width * .67, y, nose_z - .015)
                end = (side * (head_width + .064 + .022 * index), y + .04 - .021 * index, nose_z - .085)
                mesh.loft([(start, .0031, .0031), (sample(start, end, .49), .0026, .0026), (end, .0007, .0007)],
                          solid(rgb("d9c8ab")), {"Head": 1}, 5)
        if kind == "badger":
            mask = [(side * head_width * .67, center.y + .17, center.z + .019),
                    (side * head_width * .82, eye_y + .030, eye_z + .009),
                    (side * muzzle_width * .87, nose_y, nose_z - .025)]
            mesh.loft([(mask[0], .037, .027), (mask[1], .048, .023), (mask[2], .022, .015)], solid(back), {"Head": 1}, 10)
        if kind == "boar":
            root = (side * muzzle_width * .76, nose_y - .115, nose_z - .073)
            turn = (side * muzzle_width * 1.18, nose_y - .091, nose_z + .010)
            tip = (side * muzzle_width * 1.26, nose_y + .024, nose_z + .022)
            mesh.loft([(root, .034, .034), (turn, .025, .026), (tip, .004, .004)],
                      solid(rgb("e2c89b")), {"Head": 1}, 10)
        if deer:
            build_antlers(mesh, center, side, key)


def build_ear(mesh, key, kind, center, head_width, crown_height, side, palette):
    base, back, _, _, _ = palette
    rounded = kind in ("bear", "otter", "badger")
    extent = .565 if kind == "hare" else .26 if kind in ("cat", "fox", "wolf") else .18
    extent *= .73 if rounded else 1
    spread = .201 if kind == "stag" else .091 if rounded else .087 if kind == "hare" else .071
    ear_base = Vector((side * head_width * (.77 if rounded else .68), center.y + crown_height * (.47 if rounded else .70), center.z - .048))
    ear_end = ear_base + Vector((side * spread, extent, -.072 if kind == "hare" else -.041))
    width = .090 if kind == "hare" else .108 if kind == "fox" else .097
    profile = [(0, .74), (.23, 1), (.51, 1 if rounded or kind == "hare" else .64), (.78, .69 if rounded or kind == "hare" else .29), (1, .045)]
    inner = rgb("bd877a")
    if key in ("frost", "hare"):
        inner = rgb("d4aaa2")

    def shade(point, angle, progress):
        edge = blend(base, back, .42 + smooth(.58, 1, progress) * .3)
        forward = point.z - (ear_base.z + (ear_end.z - ear_base.z) * progress)
        lining = smooth(-.015, .038, forward) * smooth(.08, .30, progress) * (1 - smooth(.73, .98, progress))
        return blend(edge, inner, lining * .92)

    mesh.loft([(sample(ear_base, ear_end, t), width * scale, width * scale * .55) for t, scale in profile],
              shade, {"Head": 1}, 14)
    if key == "lynx":
        tuft = ear_end + Vector((side * .032, .108, -.007))
        mesh.loft([(sample(ear_base, ear_end, .87), .026, .020), (ear_end, .019, .016), (tuft, .002, .002)],
                  solid(back), {"Head": 1}, 8)


def build_antlers(mesh, head, side, key):
    pale = rgb("d5cbab" if key == "storm" else "c0a481")
    dark = rgb("79715a" if key == "storm" else "76533a")
    branch = [head + Vector((side * x, y, z)) for x, y, z in
              [(.113, .169, -.108), (.206, .415, -.142), (.324, .637, -.196), (.419, .819, -.23), (.486, .993, -.25)]]
    radii = [.055, .043, .036, .025, .006]
    tint = lambda _, __, t: blend(dark, pale, smooth(.08, .95, t))
    mesh.loft([(pos, radius, radius * .79) for pos, radius in zip(branch, radii)], tint, {"Head": 1}, 10)
    for origin, fork in zip(branch[1:4], [(.44, .61, .063), (.61, .81, -.053), (.67, .998, -.119)]):
        tip = head + Vector((side * fork[0], fork[1], fork[2]))
        mesh.loft([(origin, .028, .028), (sample(origin, tip, .52), .021, .019), (tip, .005, .004)], tint, {"Head": 1}, 8)


def build_tail(mesh, key, kind, dimensions, palette):
    _, height, length, _, _, _ = dimensions
    base, back, belly, *_ = palette
    tail_sizes = {"cat": (1.01, .68, .090), "fox": (1.10, .078, .193), "hare": (.19, .11, .127),
                  "otter": (.96, -.16, .13), "badger": (.34, .09, .082), "wolf": (.87, -.23, .135),
                  "boar": (.28, .18, .045), "bear": (.24, .03, .09), "stag": (.265, -.06, .091)}
    size, rise, width = tail_sizes[kind]
    if key == "lynx":
        size, rise = .32, .062
    root = Vector((0, height + .10, -.81 * length))
    mesh.joint("Tail", root)
    tip = root + Vector((.15 if kind == "cat" and key != "lynx" else .048, rise, -size))
    profile = [(0, .77), (.13, .91), (.29, 1.0), (.46, .89), (.63, .73), (.79, .55), (.90, .34), (1, .032)]
    rings = []
    for t, radius in profile:
        position = sample(root, tip, t)
        if kind == "cat" and key != "lynx":
            position.y = root.y + rise * t ** 1.27
            position.z += size * .14 * smooth(.73, 1, t)
        rings.append((position, width * radius, width * radius * (.83 if kind == "otter" else .94)))

    def shade(_, angle, t):
        color = blend(base, back, max(0, sin(angle)) * .35)
        if kind in ("fox", "hare", "stag"):
            color = blend(color, belly, smooth(.67, .85, t))
        if kind == "cat":
            band = smooth(.15, .85, sin(t * 23))
            color = blend(color, back, max(band * .68, smooth(.86, 1, t)))
        return color

    mesh.loft(rings, shade, lambda row: {"Body": .6, "Tail": .4} if row < 1 else {"Tail": 1}, 16)


def leg_rest(hip, foot_base, front):
    # Match the in-game two-bone stance, in an idle pose on level ground.
    y = foot_base - hip.y
    z = .045 if front else -.035
    span = sqrt(y * y + z * z)
    thigh = hip.y * (.57 if front else .61)
    shin = hip.y * (.60 if front else .55)
    distance = max(abs(thigh - shin) + .008, min(thigh + shin - .004, span))
    pivot = (thigh * thigh - shin * shin + distance * distance) / (2 * distance)
    bend = sqrt(max(0, thigh * thigh - pivot * pivot)) * (-1 if front else 1)
    knee = hip + Vector((0, (y * pivot + z * bend) / span, (z * pivot - y * bend) / span))
    ankle = Vector((hip.x, foot_base, hip.z + z))
    return knee, ankle


def build_leg(mesh, kind, dimensions, palette, side, front):
    w, h, length, depth, _, _ = dimensions
    base, back, _, paw, _ = palette
    label = ("Front" if front else "Hind") + ("Left" if side < 0 else "Right")
    upper, lower, foot = label + "Upper", label + "Lower", label + "Foot"
    hip = Vector((side * w * .76, h - (.18 if kind == "stag" else .095), length * (.58 if front else -.58)))
    foot_base = .057 if kind in ("stag", "boar") else .064
    knee, ankle = leg_rest(hip, foot_base, front)
    paw_center = ankle + Vector((0, 0, .065))
    mesh.joint(upper, hip, knee)
    mesh.joint(lower, knee, ankle)
    mesh.joint(foot, paw_center)
    leg_size = w * (.27 if front else .34)
    if kind == "stag":
        leg_size *= .85
    profile = [
        (hip + Vector((-side * .04, depth * .62, 0)), leg_size * .81, leg_size * .99, {"Body": .84, upper: .16}),
        (hip, leg_size * 1.12, leg_size * (1.32 if front else 1.52), {"Body": .30, upper: .70}),
        (sample(hip, knee, .38), leg_size * .94, leg_size * 1.11, {upper: 1}),
        (sample(hip, knee, .77), leg_size * .71, leg_size * .84, {upper: .90, lower: .10}),
        (knee, leg_size * .63, leg_size * .67, {upper: .51, lower: .49}),
        (sample(knee, ankle, .34), leg_size * .51, leg_size * .54, {upper: .08, lower: .92}),
        (sample(knee, ankle, .75), leg_size * .48, leg_size * .50, {lower: 1}),
        (ankle, leg_size * .54, leg_size * .52, {lower: .30, foot: .70}),
    ]
    mesh.loft([(point, rx, ry) for point, rx, ry, _ in profile],
              lambda _, angle, t: blend(blend(base, back, smooth(.18, .88, t) * .38),
                                         paw, smooth(.68, 1, t) * .87),
              lambda row: profile[row][3], 14)
    toe_length = leg_size * (1.60 if front else 1.75) + (.070 if kind == "hare" else .018)
    mesh.oval(paw_center, (leg_size * (.78 if kind == "stag" else .96), foot_base, toe_length),
              lambda _, angle, t: blend(paw, base, smooth(.01, .63, sin(angle)) * (1 - smooth(.56, .98, t)) * .38),
              foot, 12, 8)
    return {"name": label, "front": front, "hip": list(hip), "foot": foot_base,
            "upperLength": (knee - hip).length, "lowerLength": (ankle - knee).length}


def material():
    mat = bpy.data.materials.new("动物体色和花纹")
    mat.use_nodes = True
    mat.diffuse_color = (.55, .41, .27, 1)
    nodes = mat.node_tree.nodes
    shader = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Roughness"].default_value = .83
    attribute = nodes.new("ShaderNodeVertexColor")
    attribute.layer_name = "Coat"
    mat.node_tree.links.new(attribute.outputs["Color"], shader.inputs["Base Color"])
    return mat


def animal(key, spec, shared_material):
    kind, *coat = spec
    dimensions = ANATOMY[kind]
    if key == "tiger":
        dimensions = (.38, .848, .824, .31, .309, .112)
    if key == "lynx":
        dimensions = (.337, .868, .728, .267, .269, .098)
    palette = tuple(rgb(value) for value in coat)
    surface = Surface()
    surface.joint("Body", (0, 0, 0))
    build_torso(surface, key, kind, dimensions, palette)
    build_head(surface, key, kind, dimensions, palette)
    build_tail(surface, key, kind, dimensions, palette)
    legs = [build_leg(surface, kind, dimensions, palette, side, front)
            for front in (True, False) for side in (-1, 1)]

    collection = bpy.context.scene.collection
    group = bpy.data.objects.new("Animal_" + key, None)
    collection.objects.link(group)
    group["legRig"] = json.dumps(legs, separators=(",", ":"))
    group.empty_display_size = .14
    rig_data = bpy.data.armatures.new(key + "_skeleton")
    rig = bpy.data.objects.new(key + "_rig", rig_data)
    collection.objects.link(rig)
    rig.parent = group
    rig.show_in_front = True
    armature_layer = bpy.context.view_layer
    armature_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    for label, (start, end) in surface.joints.items():
        bone = rig_data.edit_bones.new(key + "_" + label)
        bone.head = blender_point(start)
        bone.tail = blender_point(end)
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.select_set(False)

    mesh_data = bpy.data.meshes.new(key + "_surface")
    mesh_data.from_pydata([blender_point(point) for point in surface.points], [], surface.faces)
    mesh_data.update()
    for polygon in mesh_data.polygons:
        polygon.use_smooth = True
    mesh_data.materials.append(shared_material)
    coat_attr = mesh_data.color_attributes.new(name="Coat", type="BYTE_COLOR", domain="POINT")
    for item, color in zip(coat_attr.data, surface.colors):
        item.color = (*color, 1)
    obj = bpy.data.objects.new(key + "_mesh", mesh_data)
    collection.objects.link(obj)
    obj.parent = rig
    groups = {name: obj.vertex_groups.new(name=key + "_" + name) for name in surface.joints}
    for index, weights in enumerate(surface.weights):
        for name, weight in weights.items():
            groups[name].add([index], weight, "REPLACE")
    modifier = obj.modifiers.new("Skin", "ARMATURE")
    modifier.object = rig
    return group, rig, obj


def write_glb(path, models, coat):
    # Serialize the Blender rest mesh, vertex colors and skin. This pack has no textures or clips.
    axis = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))
    direction = axis.to_3x3()
    binary = bytearray()
    scene_roots = []
    doc = {
        "asset": {"version": "2.0", "generator": "Command Lake / Blender " + bpy.app.version_string},
        "scene": 0, "scenes": [{"nodes": scene_roots}],
        "nodes": [], "meshes": [], "skins": [], "bufferViews": [], "accessors": [],
        "materials": [{"name": coat.name, "pbrMetallicRoughness": {
            "metallicFactor": 0, "roughnessFactor": .83
        }}]
    }

    def append(key, item):
        index = len(doc[key])
        doc[key].append(item)
        return index

    def accessor(rows, data_type, layout, target=None, bounds=False, normalized=False):
        values = [component for row in rows for component in row]
        fmt, component_type = {"float": ("f", 5126), "byte": ("B", 5121), "short": ("H", 5123)}[data_type]
        binary.extend(bytes(-len(binary) % 4))
        data = pack(f"<{len(values)}{fmt}", *values)
        view = {"buffer": 0, "byteOffset": len(binary), "byteLength": len(data)}
        if target:
            view["target"] = target
        binary.extend(data)
        item = {"bufferView": append("bufferViews", view), "componentType": component_type,
                "count": len(rows), "type": layout}
        if bounds:
            item["min"] = [min(values) for values in zip(*rows)]
            item["max"] = [max(values) for values in zip(*rows)]
        if normalized:
            item["normalized"] = True
        return append("accessors", item)

    def matrix_components(matrix):
        return [matrix[row][column] for column in range(4) for row in range(4)]

    for group, rig, obj in models:
        bones = list(rig.data.bones)
        bone_index = {bone.name: index for index, bone in enumerate(bones)}
        root = append("nodes", {"name": group.name, "extras": {"legRig": group["legRig"]}})
        scene_roots.append(root)
        joint_nodes, inverse_binds = [], []
        for bone in bones:
            matrix = axis @ bone.matrix_local
            joint_nodes.append(append("nodes", {"name": bone.name, "matrix": matrix_components(matrix)}))
            inverse_binds.append(matrix_components(matrix.inverted()))
        skin = append("skins", {"skeleton": root, "joints": joint_nodes,
                                "inverseBindMatrices": accessor(inverse_binds, "float", "MAT4")})

        mesh = obj.data
        mesh.calc_loop_triangles()
        positions = [tuple(direction @ vertex.co) for vertex in mesh.vertices]
        normals = [tuple((direction @ vertex.normal).normalized()) for vertex in mesh.vertices]
        colors = [tuple(entry.color[:3]) for entry in mesh.color_attributes["Coat"].data]
        joints, weights = [], []
        for vertex in mesh.vertices:
            influences = [(bone_index[obj.vertex_groups[entry.group].name], entry.weight) for entry in vertex.groups]
            indices, values = map(list, zip(*influences))
            if len(indices) > 4:
                raise ValueError("Each animal vertex supports at most four joint weights")
            total = sum(values)
            packed_weights = [round(value * 255 / total) for value in values]
            largest = values.index(max(values))
            packed_weights[largest] += 255 - sum(packed_weights)
            padding = [0] * (4 - len(indices))
            joints.append(indices + padding)
            weights.append(packed_weights + padding)
        triangles = [(index,) for triangle in mesh.loop_triangles for index in triangle.vertices]
        primitive = {"material": 0, "indices": accessor(triangles, "short", "SCALAR", target=34963),
                     "attributes": {
                         "POSITION": accessor(positions, "float", "VEC3", target=34962, bounds=True),
                         "NORMAL": accessor(normals, "float", "VEC3", target=34962),
                         "COLOR_0": accessor(colors, "float", "VEC3", target=34962),
                         "JOINTS_0": accessor(joints, "byte", "VEC4", target=34962),
                         "WEIGHTS_0": accessor(weights, "byte", "VEC4", target=34962, normalized=True)
                     }}
        mesh_index = append("meshes", {"name": mesh.name, "primitives": [primitive]})
        mesh_node = append("nodes", {"name": obj.name, "mesh": mesh_index, "skin": skin})
        doc["nodes"][root]["children"] = [mesh_node, *joint_nodes]

    binary.extend(bytes(-len(binary) % 4))
    doc["buffers"] = [{"byteLength": len(binary)}]
    header = json.dumps(doc, separators=(",", ":"), allow_nan=False).encode("utf8")
    header += b" " * (-len(header) % 4)
    with path.open("wb") as output:
        output.write(pack("<4sII", b"glTF", 2, 28 + len(header) + len(binary)))
        output.write(pack("<I4s", len(header), b"JSON"))
        output.write(header)
        output.write(pack("<I4s", len(binary), b"BIN\0"))
        output.write(binary)
    print(f"Exported {len(models)} rigged animals to {path}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--blend", type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    coat = material()
    animals = [animal(key, spec, coat) for key, spec in ANIMALS.items()]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    write_glb(args.output, animals, coat)
    if args.blend:
        for index, (group, _, _) in enumerate(animals):
            group.location = (4.1 * (index % 4), -4.5 * (index // 4), 0)
        for screen in bpy.data.screens:
            for area in screen.areas:
                if area.type == "VIEW_3D":
                    area.spaces.active.shading.color_type = "VERTEX"
                    area.spaces.active.region_3d.view_distance = 25
                    area.spaces.active.region_3d.view_location = Vector((6.4, -6.4, 0))
        args.blend.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(args.blend.resolve()))


if __name__ == "__main__":
    main()
