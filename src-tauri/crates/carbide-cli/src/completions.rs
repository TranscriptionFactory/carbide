use clap::CommandFactory;
use clap_complete::Shell;

pub fn generate(shell: Shell) {
    let mut cmd = super::Cli::command();

    match shell {
        Shell::Zsh => print_zsh_completions(),
        Shell::Bash => print_bash_completions(),
        _ => {
            clap_complete::generate(shell, &mut cmd, "carbide", &mut std::io::stdout());
        }
    }
}

fn print_zsh_completions() {
    print!(
        r##"#compdef carbide

_carbide_note_paths() {{
    local -a paths
    paths=("${{(@f)$(carbide files 2>/dev/null | head -n -2)}}")
    _describe 'note path' paths
}}

_carbide() {{
    local curcontext="$curcontext" state line
    typeset -A opt_args

    _arguments -C \
        '--vault[Vault ID]:vault id:' \
        '--json[Output as JSON]' \
        '--install-cli[Install CLI]' \
        '--uninstall-cli[Remove CLI]' \
        '--completions[Generate completions]:shell:(bash zsh fish powershell elvish)' \
        '1:command:->cmds' \
        '*::arg:->args'

    case $state in
    cmds)
        _values 'command' \
            'read[Read a note]' \
            'cat[Read a note (raw output)]' \
            'open[Open a note in the default app]' \
            'edit[Open a note in $EDITOR]' \
            'create[Create a new note]' \
            'write[Write content to a note]' \
            'append[Append content to a note]' \
            'prepend[Prepend content after frontmatter]' \
            'rename[Rename a note]' \
            'move[Move a note to a different folder]' \
            'delete[Delete a note]' \
            'search[Search notes]' \
            'files[List files in vault]' \
            'tags[List tags in vault]' \
            'outline[Show headings for a note]' \
            'vault[Show active vault info]' \
            'vaults[List known vaults]' \
            'reindex[Rebuild the search index]' \
            'status[Show app status]' \
            'mcp[Run as MCP stdio proxy]' \
            'setup[Configure MCP integration]'
        ;;
    args)
        case $line[1] in
        read|cat|open|edit|outline|delete)
            _arguments '1:note path:_carbide_note_paths' '*::options:'
            ;;
        write|append|prepend)
            _arguments '1:note path:_carbide_note_paths' '--content[Content]:content:'
            ;;
        rename)
            _arguments '1:note path:_carbide_note_paths' '--new-path[New path]:new path:_carbide_note_paths'
            ;;
        move)
            _arguments '1:note path:_carbide_note_paths' '--to[Target folder]:folder:'
            ;;
        search)
            _arguments '1:query:' '--limit[Max results]:limit:' '--paths-only[Output only paths]'
            ;;
        tags)
            _arguments '--filter[Show notes with tag]:tag:'
            ;;
        files)
            _arguments '--folder[Filter by folder]:folder:'
            ;;
        setup)
            _values 'target' 'desktop[Claude Desktop]' 'code[Claude Code]'
            ;;
        esac
        ;;
    esac
}}

_carbide "$@"
"##
    );
}

fn print_bash_completions() {
    print!(
        r##"_carbide_note_paths() {{
    local paths
    paths=$(carbide files 2>/dev/null | head -n -2)
    COMPREPLY=($(compgen -W "$paths" -- "${{COMP_WORDS[COMP_CWORD]}}"))
}}

_carbide() {{
    local cur prev commands
    COMPREPLY=()
    cur="${{COMP_WORDS[COMP_CWORD]}}"
    prev="${{COMP_WORDS[COMP_CWORD-1]}}"
    commands="read cat open edit create write append prepend rename move delete search files tags outline vault vaults reindex status mcp setup"

    if [[ $COMP_CWORD -eq 1 ]]; then
        COMPREPLY=($(compgen -W "$commands" -- "$cur"))
        return
    fi

    case "${{COMP_WORDS[1]}}" in
        read|cat|open|edit|outline|delete|write|append|prepend|rename|move)
            if [[ $COMP_CWORD -eq 2 ]]; then
                _carbide_note_paths
            fi
            ;;
        search)
            case "$prev" in
                --limit) ;;
                *) COMPREPLY=($(compgen -W "--limit --paths-only" -- "$cur")) ;;
            esac
            ;;
        tags)
            COMPREPLY=($(compgen -W "--filter" -- "$cur"))
            ;;
        files)
            COMPREPLY=($(compgen -W "--folder" -- "$cur"))
            ;;
        setup)
            if [[ $COMP_CWORD -eq 2 ]]; then
                COMPREPLY=($(compgen -W "desktop code" -- "$cur"))
            fi
            ;;
    esac
}}

complete -F _carbide carbide
"##
    );
}
