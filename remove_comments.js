const fs = require('fs');
const path = require('path');

function removeComments(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Remove block comments that are 3+ lines or multi-line
    content = content.replace(/\/\*[\s\S]*?\*\//g, (match) => {
        if (match.includes('\n')) return '';
        return match;
    });

    // Remove single line comments that are just explaining obvious things
    // We'll remove lines starting with // that are full line comments unless they are very short
    const lines = content.split('\n');
    const newLines = lines.filter(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//')) {
            // Keep very short comments (e.g., eslint-disable, or 2-3 words)
            return trimmed.length < 20 && !trimmed.toLowerCase().includes('phase') && !trimmed.toLowerCase().includes('step');
        }
        return true;
    });

    // Also remove trailing comments
    const finalLines = newLines.map(line => {
        const commentIndex = line.indexOf('//');
        if (commentIndex > 0 && !line.includes('http')) {
            return line; // keep trailing for safety or strip? Let's keep them as they are usually minor
        }
        return line;
    });

    fs.writeFileSync(filePath, finalLines.join('\n'));
}

const filesToProcess = [
    'functions/src/studio/index.ts',
    'functions/src/tokens/index.ts',
    'functions/src/community/index.ts',
    'functions/src/billing/index.ts',
    'functions/src/creations/index.ts',
    'functions/src/auth/index.ts',
    'functions/src/index.ts',
    'firestore.rules',
    'storage.rules'
];

filesToProcess.forEach(file => {
    const fullPath = path.join(__dirname, file);
    if (fs.existsSync(fullPath)) {
        removeComments(fullPath);
        console.log(`Cleaned ${file}`);
    }
});
