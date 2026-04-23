git reset HEAD~1
rm ./backport.sh
git cherry-pick fc1af36539e63e02ba5ddd78ffa243fadd069a94
echo 'Resolve conflicts and force push this branch.\n\nTo backport translations run: bin/i18n/merge-translations <release-branch>'
