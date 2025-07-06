import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';

let scene, camera, renderer, controls;
let currentModel = null; // 現在表示中のモデルを追跡するための変数
let meshObjects = {}; // メッシュ名とThree.jsオブジェクトをマッピングするための辞書

let originalMeshMaterials = {}; // 各メッシュの元のマテリアルを保存するための辞書

let selectedMesh = null; // 現在選択されているメッシュオブジェクト

// ★★★  新しいUI要素の変数 ★★★
let emissiveColorPicker, emissiveIntensitySlider, emissiveIntensityValueDisplay;


window.addEventListener("DOMContentLoaded", init);

function init() {
    // ★★★ 変更点1: width と height をウィンドウサイズに合わせる ★★★
    const width = window.innerWidth;
    const height = window.innerHeight;

    // レンダラーを作成
    const canvasElement = document.querySelector('#myCanvas');
    renderer = new THREE.WebGLRenderer({
        antialias: true,
        canvas: canvasElement,
    });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height);

    // シーンを作成
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xaaaaaa); // 背景色を少し明るくして見やすく

    // カメラを作成
    camera = new THREE.PerspectiveCamera(45, width / height, 1, 10000); // ★★★ ここも変更した width/height を使う ★★★
    camera.position.set(0, 0, 600);

    // カメラコントローラーを作成
    controls = new OrbitControls(camera, canvasElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.2;

    // 環境光源を作成
    const ambientLight = new THREE.AmbientLight(0xffffff);
    ambientLight.intensity = 0.5;
    scene.add(ambientLight);

    // 平行光源を作成
    const directionalLight = new THREE.DirectionalLight(0xffffff);
    directionalLight.intensity = 1;
    directionalLight.position.set(1, 3, 1);
    scene.add(directionalLight);

    // ファイル入力要素を取得
    const fileInput = document.getElementById('fileInput');
    const fileNameDisplay = document.getElementById('fileNameDisplay');

    // 光源 コントロールパネルの要素を取得
    const meshSelectElement = document.getElementById('meshSelect');
    const emissiveToggle = document.getElementById('emissiveToggle');
    // -----------------------------------

    emissiveColorPicker = document.getElementById('emissiveColorPicker');
    emissiveIntensitySlider = document.getElementById('emissiveIntensitySlider');
    emissiveIntensityValueDisplay = document.getElementById('emissiveIntensityValue');


    // ファイルが選択されたときのイベントリスナー
    fileInput.addEventListener('change', (event) => {
        const files = Array.from(event.target.files); // 選択された全てのファイルを配列として取得
        if (files.length === 0) {
            fileNameDisplay.textContent = "";
            return;
        }

        // OBJファイルとMTLファイルを探す
        const objFile = files.find(file => file.name.toLowerCase().endsWith('.obj'));
        const mtlFile = files.find(file => file.name.toLowerCase().endsWith('.mtl'));

        if (!objFile) {
            fileNameDisplay.textContent = "OBJファイルが選択されていません。";
            return;
        }

        fileNameDisplay.textContent = `選択中のファイル: ${objFile.name}`;

        // FileReaderを使用してOBJファイルの内容を読み込む
        const objReader = new FileReader();
        objReader.onload = (e) => {
            const objContent = e.target.result;

            // 既存のモデルがあれば削除
            if (currentModel) {
                scene.remove(currentModel);
                currentModel.traverse(child => {
                    if (child.isMesh) {
                        child.geometry.dispose();
                        // マテリアルのdisposeも忘れずに
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => mat.dispose());
                        } else {
                            child.material.dispose();
                        }
                    }
                });
            }

            // MTLファイルがある場合、その内容も読み込む
            if (mtlFile) {
                const mtlReader = new FileReader();
                mtlReader.onload = (mtlE) => {
                    const mtlContent = mtlE.target.result;
                    loadModel(objContent, mtlContent);
                };
                mtlReader.readAsText(mtlFile);
            } else {
                // MTLファイルがない場合はOBJだけ読み込む
                loadModel(objContent, null);
            }
        };

        objReader.readAsText(objFile); // OBJファイルをテキストとして読み込む
    });

    //-------------------------------------------------------------------------------
meshSelectElement.addEventListener('change', () => {
    const selectedName = meshSelectElement.value;
    selectedMesh = meshObjects[selectedName] || null;
    updateEffectControls();
});
  //-------------------------------------------------------------------------------

    // ★★★ メッシュ選択と効果トグルのイベントリスナー ★★★
emissiveToggle.addEventListener('change', () => {
        if (selectedMesh) {
            // Three.jsのマテリアルは参照渡しなので、
            // emissiveプロパティを変更すると、同じマテリアルを参照している他のメッシュも影響を受ける。
            // これを避けるため、発光させるメッシュにはマテリアルの複製を割り当てる。

            // マテリアルが配列の場合も考慮 (OBJの場合、単一マテリアルであることが多いが、念のため)
            const materials = Array.isArray(selectedMesh.material) ? selectedMesh.material : [selectedMesh.material];

            if (emissiveToggle.checked) {
                // 発光を有効にする
                // 元のマテリアルを複製して発光プロパティを設定
                materials.forEach((originalMat, index) => {
                    if (originalMat.isMeshStandardMaterial || originalMat.isMeshPhongMaterial || originalMat.isMeshLambertMaterial) {
                        // Material.clone() を使用してマテリアルを複製する
                        const emissiveMat = originalMat.clone();
                        emissiveMat.emissive.setHex(emissiveColorPicker.value.replace('#', '0x')); // カラーピッカーの値を発光色に
                        emissiveMat.emissiveIntensity = parseFloat(emissiveIntensitySlider.value); // スライダーの値を発光強度に
                        emissiveMat.needsUpdate = true;

                        if (Array.isArray(selectedMesh.material)) {
                            selectedMesh.material[index] = emissiveMat;
                        } else {
                            selectedMesh.material = emissiveMat;
                        }
                    } else {
                         console.warn("Emissive effect not supported for this material type:", originalMat.type);
                    }
                });
            } else {
                // 発光を無効にする
                // 元のマテリアルに戻す
                if (originalMeshMaterials[selectedMesh.name]) {
                    selectedMesh.material = originalMeshMaterials[selectedMesh.name]; // 元のマテリアルに戻す
                    selectedMesh.material.needsUpdate = true;
                }
            }
            // ★★★ 変更: emissiveToggle の変更後もコントロールの状態を更新 ★★★
            updateEffectControls(); 
        }
    });

    // ★★★ 追加: 発光色・強度スライダーのイベントリスナー ★★★
    emissiveColorPicker.addEventListener('input', () => {
        if (selectedMesh && emissiveToggle.checked) {
            const materials = Array.isArray(selectedMesh.material) ? selectedMesh.material : [selectedMesh.material];
            materials.forEach(material => {
                if (material.isMeshStandardMaterial || material.isMeshPhongMaterial || material.isMeshLambertMaterial) {
                    material.emissive.setHex(emissiveColorPicker.value.replace('#', '0x'));
                    material.needsUpdate = true;
                }
            });
        }
    });

    emissiveIntensitySlider.addEventListener('input', () => {
        if (selectedMesh && emissiveToggle.checked) {
            const materials = Array.isArray(selectedMesh.material) ? selectedMesh.material : [selectedMesh.material];
            const intensity = parseFloat(emissiveIntensitySlider.value);
            materials.forEach(material => {
                if (material.isMeshStandardMaterial || material.isMeshPhongMaterial || material.isMeshLambertMaterial) {
                    material.emissiveIntensity = intensity;
                    material.needsUpdate = true;
                }
            });
            emissiveIntensityValueDisplay.textContent = intensity.toFixed(2); // 表示を更新
        }
    });


    // メッシュが選択されていないときにコントロールを無効化する関数
    function updateEffectControls() {
        // 全コントロールの有効/無効をリセット
        emissiveToggle.disabled = !selectedMesh;
        emissiveColorPicker.disabled = !selectedMesh || !emissiveToggle.checked;
        emissiveIntensitySlider.disabled = !selectedMesh || !emissiveToggle.checked;

        if (selectedMesh) {
            const material = Array.isArray(selectedMesh.material) ? selectedMesh.material[0] : selectedMesh.material;
            
            // 発光トグルの状態を更新
            // ★★★ 変更: emissiveToggle.checked の更新ロジックを修正 ★★★
            if (material && (material.isMeshStandardMaterial || material.isMeshPhongMaterial || material.isMeshLambertMaterial)) {
                // 現在のselectedMeshのマテリアルが、発光が設定されたマテリアルかどうかをチェック
                emissiveToggle.checked = (material.emissive.getHex() !== 0x000000) && (material.emissiveIntensity > 0);
            } else {
                emissiveToggle.checked = false;
            }

            // 発光の色と強度のUI要素の値を更新
            if (emissiveToggle.checked && material && (material.isMeshStandardMaterial || material.isMeshPhongMaterial || material.isMeshLambertMaterial)) {
                emissiveColorPicker.value = '#' + material.emissive.getHexString();
                emissiveIntensitySlider.value = material.emissiveIntensity;
                emissiveIntensityValueDisplay.textContent = material.emissiveIntensity.toFixed(2);
            } else {
                // 発光がオフの場合、デフォルト値に戻すか、無効状態に合わせる
                emissiveColorPicker.value = '#ffffff'; // デフォルト色
                emissiveIntensitySlider.value = 0; // デフォルト強度
                emissiveIntensityValueDisplay.textContent = "0.00";
            }
        } else {
            // メッシュが選択されていない場合、全てのコントロールを無効化し、デフォルト値に戻す
            emissiveToggle.checked = false;
            emissiveColorPicker.value = '#ffffff';
            emissiveIntensitySlider.value = 0;
            emissiveIntensityValueDisplay.textContent = "0.00";
        }
    }

    // 初期状態でのコントロール更新
    updateEffectControls();

    tick();
}




function loadModel(objContent, mtlContent) {
    const objLoader = new OBJLoader();

    if (mtlContent) {
        const mtlLoader = new MTLLoader();
        const materials = mtlLoader.parse(mtlContent);
        materials.preload();
        objLoader.setMaterials(materials);
    }

    const obj = objLoader.parse(objContent);
    scene.add(obj);


// メッシュリストを初期化
meshSelectElement.innerHTML = '';
meshObjects = {};
originalMeshMaterials = {};

obj.traverse((child) => {
    if (child.isMesh) {
        meshObjects[child.name] = child;
        originalMeshMaterials[child.name] = child.material;

        const option = document.createElement('option');
        option.value = child.name;
        option.textContent = child.name || '(無名メッシュ)';
        meshSelectElement.appendChild(option);
    }
});

// 最初に選ばれているものを初期化
selectedMesh = null;
updateEffectControls();



    currentModel = obj;

        console.log("Loaded Model Structure:", obj);
        obj.traverse((child) => {
/*
        if (child.isMesh && child.material) {
            console.log(`  Mesh Name: ${child.name}, Type: ${child.type}`);
        } else if (child.isGroup) {
            console.log(`  Group Name: ${child.name}, Type: ${child.type}`);
*/  
            console.log(`  Traversing: ${child.name || child.uuid} (Type: ${child.type})`); // <-- この行か、または類似の行
            console.log(`    -> IS GROUP! Name: ${child.name}`);
        })};


    // モデルの位置とスケールを調整
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const targetSize = 300;
    const scale = targetSize / maxDim;
    obj.scale.set(scale, scale, scale);

    box.setFromObject(obj);
    center.copy(box.getCenter(new THREE.Vector3()));

    obj.position.x += (obj.position.x - center.x);
    obj.position.y += (obj.position.y - center.y);
    obj.position.z += (obj.position.z - center.z);
    
    const cameraDistance = maxDim * scale * 1.5;
    camera.position.set(0, 0, cameraDistance);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();

    // ★★★ ------------------------------------------------------------------------ ★★★
    // 既存のメッシュリストをクリア
    const meshListElement = document.getElementById('meshList');
    meshListElement.innerHTML = ''; // リストを空にする

    // Selectボックスのオプションをクリアし、初期オプションを追加
    const meshSelectElement = document.getElementById('meshSelect');
    meshSelectElement.innerHTML = '<option value="">- メッシュを選択 -</option>';

        /*
    meshObjects = {}; // メッシュオブジェクトの辞書もクリア
    selectedMesh = null; // 選択中のメッシュをリセット
    document.getElementById('emissiveToggle').checked = false; // チェックボックスをリセット
    document.getElementById('emissiveToggle').disabled = true; // 無効化
        */
        meshObjects = {};
    originalMeshMaterials = {}; // ★★★ 追加: オリジナルマテリアル辞書もクリア ★★★
    selectedMesh = null; // 選択中のメッシュをリセット

    // ★★★ 変更: モデルロード時にもコントロールの状態を初期化 ★★★
    updateEffectControls(); 


    let meshCount = 0;
    obj.traverse((child) => {
        // メッシュであり、かつマテリアルを持っているオブジェクトのみを対象とする 
        // child.material のチェックを追加
        // 一部のOBJモデルは、Three.jsでMeshとして読み込まれるが、マテリアルを持たない（ラインや点など）ことがある
//        if (child.isMesh) {
//            let meshName = child.name;
            // 名前がないメッシュには、親の名前や連番を付ける
        if (child.isMesh && child.material) {
            totalMeshesFound++; // Found a valid mesh
            console.log(`    -> IS MESH! Name: ${child.name}, Material: ${child.material ? child.material.type : 'NONE'}`);

            let meshName = child.name;
            if (!meshName) {
                if (child.parent && child.parent.name) {
                    meshName = `${child.parent.name}_Mesh${meshCount}`;
                } else {
                    meshName = `UnnamedMesh${meshCount}`;
                }
            }
            meshCount++;

            let uniqueMeshName = meshName;
            let counter = 1;
            while (meshObjects[uniqueMeshName]) {
                uniqueMeshName = `${meshName}_${counter}`;
                counter++;
            }
            child.name = uniqueMeshName;

            meshObjects[uniqueMeshName] = child;

            
            // 各メッシュの元のマテリアルを保存
            if (Array.isArray(child.material)) {
                originalMeshMaterials[uniqueMeshName] = child.material.map(mat => mat.clone());
            } else {
                originalMeshMaterials[uniqueMeshName] = child.material.clone();
            }

            const listItem = document.createElement('li');
            listItem.textContent = uniqueMeshName;
            listItem.dataset.meshName = uniqueMeshName;

            listItem.addEventListener('click', () => {
                const clickedMeshName = listItem.dataset.meshName;
                meshSelectElement.value = clickedMeshName;
                const event = new Event('change');
                meshSelectElement.dispatchEvent(event);
            });
            meshListElement.appendChild(listItem);

            const option = document.createElement('option');
            option.value = uniqueMeshName;
            option.textContent = uniqueMeshName;
            meshSelectElement.appendChild(option);
        }
    });
//}
/*
            // 重複する名前を避けるためにユニークなIDを付与
            let uniqueMeshName = meshName;
            let counter = 1;
            while (meshObjects[uniqueMeshName]) {
                uniqueMeshName = `${meshName}_${counter}`;
                counter++;
            }
            child.name = uniqueMeshName; // Three.jsオブジェクトの名前も更新（getObjectByNameでアクセスしやすくするため）

            meshObjects[uniqueMeshName] = child; // メッシュ名をキーにThree.jsオブジェクトを保存

            // HTMLリストに項目を追加
            const listItem = document.createElement('li');
            listItem.textContent = uniqueMeshName; // UIに表示する名前
            listItem.dataset.meshName = uniqueMeshName; // データ属性に実際のメッシュ名を持たせる



            listItem.addEventListener('click', () => {
                const clickedMeshName = listItem.dataset.meshName;
                meshSelectElement.value = clickedMeshName; // selectボックスの値も更新
                const event = new Event('change'); // changeイベントを手動で発火
                meshSelectElement.dispatchEvent(event);
            });
            meshListElement.appendChild(listItem);

            // Selectボックスにオプションを追加
                const option = document.createElement('option');
                option.value = uniqueMeshName;
                option.textContent = uniqueMeshName;
                meshSelectElement.appendChild(option);
        }
    });
*/
    // モデル全体の回転アニメーションは一旦削除またはコメントアウト
    // if (currentModel) {
    //     currentModel.rotation.y += 0.005;
    // }



// シーン、カメラ、レンダラーのセットアップ
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// ライティングの追加
// アンビエントライト: シーン全体を均等に照らす
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

// ディレクショナルライト: 特定の方向からの光
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 7.5);
scene.add(directionalLight);

// テクスチャの読み込みとマテリアルの適用
const textureLoader = new THREE.TextureLoader();
textureLoader.load(
  'assets/textures/modelTexture.png', // 画像ファイルの正しいパスを指定してください
  (texture) => {
    texture.needsUpdate = true;

    // モデルのジオメトリ (例としてBoxGeometryを使用)
    // 実際のモデルのジオメトリがある場合は、こちらに置き換えてください
    const geometry = new THREE.BoxGeometry(1, 1, 1);

    // MeshStandardMaterialを使用して、ライトの影響を受けるマテリアルに設定
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.7,
      metalness: 0.2,
    });

    // メッシュを生成し、シーンに追加
    const modelMesh = new THREE.Mesh(geometry, material);
    scene.add(modelMesh);
  },
  undefined,
  (error) => {
    console.error('テクスチャの読み込みに失敗しました:', error);
  }
);

// アニメーションループ
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();

// ビューポートのリサイズに対応
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});




// ★★★ 変更点2: onWindowResize 関数は既にありますが、内容を再確認 ★★★
function tick() {
    controls.update(); // カメラコントローラーの更新
    renderer.render(scene, camera); // レンダリング
    requestAnimationFrame(tick);
};

// ウィンドウのリサイズイベントハンドラ
window.addEventListener('resize', onWindowResize, false);

function onWindowResize() {
    const newWidth = window.innerWidth;
    const newHeight = window.innerHeight;

    // カメラのアスペクト比を更新
    camera.aspect = newWidth / newHeight;
    camera.updateProjectionMatrix();

    // レンダラーのサイズを更新
    renderer.setSize(newWidth, newHeight);
    renderer.setPixelRatio(window.devicePixelRatio); // 解像度調整
}












/**
 * モデルをロードする関数（テクスチャの自動読み込みは考慮しない）
 * @param {string} objContent - OBJファイルの内容
 * @param {string|null} mtlContent - MTLファイルの内容 (なければnull)
 */






