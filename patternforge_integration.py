bl_info = {
    "name": "PatternForge PBR Importer (Triplanar optional)",
    "author": "PatternForge",
    "version": (3, 5),
    "blender": (3, 0, 0),
    "location": "3D View > Sidebar > PatternForge",
    "description": "Import PBR textures from ZIP and create material with triplanar or UV mapping",
    "category": "Import-Export",
}

import bpy
import os
import zipfile
import shutil
from pathlib import Path

def log(msg):
    print(f"[PatternForge] {msg}")

def load_image(path):
    try:
        img_name = Path(path).name
        existing = bpy.data.images.get(img_name)
        if existing:
            return existing
        img = bpy.data.images.load(filepath=path)
        img.pack()
        return img
    except Exception as e:
        log(f"Failed to load {path}: {e}")
        return None

def setup_pbr_material(mat, textures, use_triplanar=True):
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    
    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (800, 0)
    principled = nodes.new("ShaderNodeBsdfPrincipled")
    principled.location = (400, 0)
    links.new(principled.outputs["BSDF"], output.inputs["Surface"])
    
    # Координаты: либо Generated (для трипланара), либо UV
    tex_coord = nodes.new("ShaderNodeTexCoord")
    tex_coord.location = (-800, 0)
    mapping = nodes.new("ShaderNodeMapping")
    mapping.location = (-600, 0)
    if use_triplanar:
        links.new(tex_coord.outputs["Generated"], mapping.inputs["Vector"])
    else:
        links.new(tex_coord.outputs["UV"], mapping.inputs["Vector"])
    
    def add_texture(img, label, y, is_non_color=False):
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = img
        tex.label = label
        tex.location = (-400, y)
        links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
        if is_non_color and img:
            img.colorspace_settings.name = 'Non-Color'
        return tex
    
    y = 400
    base_node = None
    if textures.get("basecolor"):
        img = load_image(textures["basecolor"])
        if img:
            base_node = add_texture(img, "BaseColor", y)
            links.new(base_node.outputs["Color"], principled.inputs["Base Color"])
            y -= 250
    
    if textures.get("roughness"):
        img = load_image(textures["roughness"])
        if img:
            node = add_texture(img, "Roughness", y, is_non_color=True)
            links.new(node.outputs["Color"], principled.inputs["Roughness"])
            y -= 250
    
    if textures.get("metallic"):
        img = load_image(textures["metallic"])
        if img:
            node = add_texture(img, "Metallic", y, is_non_color=True)
            links.new(node.outputs["Color"], principled.inputs["Metallic"])
            y -= 250
    
    if textures.get("normal"):
        img = load_image(textures["normal"])
        if img:
            tex = add_texture(img, "Normal", y, is_non_color=True)
            normal_map = nodes.new("ShaderNodeNormalMap")
            normal_map.location = (-200, y)
            normal_map.inputs["Strength"].default_value = 1.0
            links.new(tex.outputs["Color"], normal_map.inputs["Color"])
            links.new(normal_map.outputs["Normal"], principled.inputs["Normal"])
            y -= 250
    
    if textures.get("height"):
        img = load_image(textures["height"])
        if img:
            tex = add_texture(img, "Height", y, is_non_color=True)
            bump = nodes.new("ShaderNodeBump")
            bump.location = (-200, y)
            bump.inputs["Strength"].default_value = 0.1
            links.new(tex.outputs["Color"], bump.inputs["Height"])
            links.new(bump.outputs["Normal"], principled.inputs["Normal"])
            y -= 250
    
    if textures.get("ao") and textures.get("basecolor"):
        ao_img = load_image(textures["ao"])
        if ao_img and base_node:
            ao_node = add_texture(ao_img, "AO", y, is_non_color=True)
            mix = nodes.new("ShaderNodeMixRGB")
            mix.blend_type = 'MULTIPLY'
            mix.location = (-100, y + 100)
            links.new(base_node.outputs["Color"], mix.inputs[1])
            links.new(ao_node.outputs["Color"], mix.inputs[2])
            links.new(mix.outputs["Color"], principled.inputs["Base Color"])
            for link in principled.inputs["Base Color"].links:
                links.remove(link)
            links.new(mix.outputs["Color"], principled.inputs["Base Color"])
    
    return mat

def import_zip(zip_path, context, use_triplanar=True):
    if not os.path.isfile(zip_path) or not zipfile.is_zipfile(zip_path):
        raise ValueError("Файл не является ZIP-архивом")
    
    temp_dir = Path(bpy.app.tempdir) / "patternforge_extract"
    if temp_dir.exists():
        shutil.rmtree(temp_dir)
    temp_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        with zipfile.ZipFile(zip_path, 'r') as zf:
            zf.extractall(temp_dir)
        
        textures = {
            "basecolor": None, "roughness": None, "normal": None,
            "metallic": None, "ao": None, "height": None
        }
        for root, _, files in os.walk(temp_dir):
            for f in files:
                if not f.lower().endswith(('.png', '.jpg', '.jpeg')):
                    continue
                path = os.path.join(root, f)
                name = f.lower()
                if any(x in name for x in ["basecolor", "albedo", "diffuse", "color"]):
                    textures["basecolor"] = path
                elif "roughness" in name:
                    textures["roughness"] = path
                elif "normal" in name:
                    textures["normal"] = path
                elif "metallic" in name:
                    textures["metallic"] = path
                elif "ao" in name or "ambient" in name:
                    textures["ao"] = path
                elif "height" in name or "displacement" in name:
                    textures["height"] = path
        
        if not textures["basecolor"]:
            raise ValueError("Нет карты Base Color")
        
        obj = context.active_object
        if not obj or obj.type != 'MESH':
            bpy.ops.mesh.primitive_uv_sphere_add(radius=1.5)
            obj = context.active_object
        
        # Убедимся, что есть UV (для UV-режима)
        if not use_triplanar and not obj.data.uv_layers:
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.uv.smart_project()
            bpy.ops.object.mode_set(mode='OBJECT')
        
        mat_name = Path(zip_path).stem
        old_mat = bpy.data.materials.get(mat_name)
        if old_mat and old_mat.users == 0:
            bpy.data.materials.remove(old_mat)
        elif old_mat:
            mat_name = bpy.path.clean_name(mat_name + "_imported")
        
        mat = bpy.data.materials.new(name=mat_name)
        setup_pbr_material(mat, textures, use_triplanar)
        
        if obj.data.materials:
            obj.data.materials[0] = mat
        else:
            obj.data.materials.append(mat)
        
        log("Material created successfully")
        return obj
    finally:
        if temp_dir.exists():
            shutil.rmtree(temp_dir)

class PF_OT_import(bpy.types.Operator):
    bl_idname = "patternforge.import"
    bl_label = "Import PatternForge ZIP"
    filepath: bpy.props.StringProperty(subtype="FILE_PATH")
    use_triplanar: bpy.props.BoolProperty(name="Triplanar Mapping", default=True,
        description="Использовать трипланарное отображение (как в веб-превью). Отключите для UV-маппинга.")
    
    def execute(self, context):
        try:
            obj = import_zip(self.filepath, context, self.use_triplanar)
            self.report({'INFO'}, f"Материал применён к {obj.name}")
        except Exception as e:
            self.report({'ERROR'}, str(e))
        return {'FINISHED'}
    
    def invoke(self, context, event):
        return context.window_manager.invoke_props_dialog(self)

class PF_PT_panel(bpy.types.Panel):
    bl_label = "PatternForge"
    bl_idname = "PF_PT_panel"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "PatternForge"
    
    def draw(self, context):
        layout = self.layout
        layout.label(text="Импорт PBR текстур из ZIP")
        layout.operator("patternforge.import", icon='FILE_FOLDER')

def register():
    bpy.utils.register_class(PF_OT_import)
    bpy.utils.register_class(PF_PT_panel)

def unregister():
    bpy.utils.unregister_class(PF_OT_import)
    bpy.utils.unregister_class(PF_PT_panel)

if __name__ == "__main__":
    register()
